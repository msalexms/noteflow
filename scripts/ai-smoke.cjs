// Headless end-to-end smoke test for the AI worker.
// Run with: npx electron scripts/ai-smoke.cjs
// Validates: native module loading under Electron, deferred model download,
// embeddings, sqlite-vec KNN, FTS5, and hybrid search/related.
const { app, utilityProcess } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

const WORKER = path.join(__dirname, '..', 'dist-electron', 'ai', 'aiWorker.js')
const TMP = path.join(os.tmpdir(), 'noteflow-ai-smoke')
const DB = path.join(TMP, 'index.db')
const CACHE = path.join(TMP, 'models')   // persisted across runs → model cached after first run

fs.mkdirSync(TMP, { recursive: true })
try { fs.rmSync(DB, { force: true }) } catch {}
try { fs.rmSync(DB + '-wal', { force: true }) } catch {}
try { fs.rmSync(DB + '-shm', { force: true }) } catch {}

// Format v2: one folder per note (note.md anchor + one .md per section)
function writeNoteDir(dirname, id, title, sections) {
  const dirPath = path.join(TMP, dirname)
  fs.rmSync(dirPath, { recursive: true, force: true })
  fs.mkdirSync(dirPath, { recursive: true })
  const index = sections.map((s) => `  - id: ${s.id}\n    name: ${s.name}\n    file: ${s.id}.md`).join('\n')
  fs.writeFileSync(path.join(dirPath, 'note.md'),
    `---\nid: ${id}\ntitle: "${title}"\ntags: []\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\nformatVersion: 2\nsections:\n${index}\n---\n`, 'utf-8')
  for (const s of sections) fs.writeFileSync(path.join(dirPath, `${s.id}.md`), s.body, 'utf-8')
  return dirPath
}

const NOTES = [
  // Cluster 1: React
  { dir: 'a-react0001', id: 'react0001', title: 'React hooks', sections: [{ id: 's1', name: 'Note', body: 'useEffect runs after every render. Use useState to hold component state and useMemo to memoize values.' }] },
  { dir: 'b-react0002', id: 'react0002', title: 'Cleaning up effects', sections: [{ id: 's1', name: 'Note', body: 'When a component unmounts you should clean up subscriptions and timers by returning a cleanup function from the effect.' }] },
  { dir: 'c-react0003', id: 'react0003', title: 'Custom hooks', sections: [{ id: 's1', name: 'Note', body: 'Extract reusable logic into custom hooks. useCallback and useRef help build stable hook APIs in React.' }] },
  // Cluster 2: cooking
  { dir: 'd-cook0001', id: 'cook0001', title: 'Cooking pasta', sections: [{ id: 's1', name: 'Note', body: 'Boil water, add salt, cook the spaghetti for nine minutes, then drain it in a colander.' }] },
  { dir: 'e-cook0002', id: 'cook0002', title: 'Pizza dough', sections: [{ id: 's1', name: 'Note', body: 'Mix flour, water, yeast and salt. Knead the dough and let it rise for two hours before baking.' }] },
  { dir: 'f-cook0003', id: 'cook0003', title: 'Green salad', sections: [{ id: 's1', name: 'Note', body: 'Chop lettuce, tomato and cucumber. Toss with olive oil, vinegar and a pinch of salt.' }] },
  // Multi-section note: two React-themed sections (tests same-note section relating)
  { dir: 'g-multi0001', id: 'multi0001', title: 'React deep dive', sections: [
    { id: 's1', name: 'Hooks', body: 'useEffect and useState are the core React hooks for state and side effects.' },
    { id: 's2', name: 'Effects', body: 'Side effects run inside useEffect; clean them up by returning a function on unmount.' },
  ] },
]

let child
let nextId = 1
const pending = new Map()

function req(type, payload) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    child.postMessage({ type, id, payload })
  })
}

function fail(msg) { console.error('❌', msg); cleanup(1) }
function cleanup(code) { try { child && child.kill() } catch {} app.exit(code) }

app.whenReady().then(async () => {
  child = utilityProcess.fork(WORKER, [], { serviceName: 'noteflow-ai-smoke' })
  child.on('message', (msg) => {
    if (msg.type === 'result') { pending.get(msg.id)?.resolve(msg.payload); pending.delete(msg.id) }
    else if (msg.type === 'error') { pending.get(msg.id)?.reject(new Error(msg.error)); pending.delete(msg.id) }
    else if (msg.type === 'state') console.log('   · state:', msg.payload)
    else if (msg.type === 'progress') console.log('   · progress:', msg.payload)
  })
  child.on('exit', (code) => console.log('worker exited', code))

  const timeout = setTimeout(() => fail('TIMEOUT (model download or inference took too long)'), 180000)

  try {
    await new Promise((r) => child.once('spawn', r))
    console.log('1) init (downloads model on first run)…')
    const init = await req('init', { modelId: 'Xenova/paraphrase-multilingual-mpnet-base-v2', cacheDir: CACHE, dbPath: DB })
    console.log('   init →', init)
    // index-note is a no-op while the model is dormant — load it explicitly
    await req('load-model', {})

    console.log(`2) indexing ${NOTES.length} notes…`)
    for (const n of NOTES) {
      const dirPath = writeNoteDir(n.dir, n.id, n.title, n.sections)
      await req('index-note', { dirPath })
    }
    console.log('   indexed.')

    console.log('3) semantic search: "how do I clean up subscriptions when unmounting"')
    const hits = await req('search', { query: 'how do I clean up subscriptions when unmounting', k: 3 })
    hits.forEach((h, i) => console.log(`   #${i + 1} ${h.noteId} score=${h.score.toFixed(4)}  ${h.snippet.slice(0, 50)}`))

    console.log('4) related to react0001 / section s1 (React hooks)…')
    const rel = await req('related', { noteId: 'react0001', sectionId: 's1', k: 5 })
    rel.forEach((r, i) => console.log(`   #${i + 1} ${r.noteId} "${r.title}" [${r.sectionName}] score=${r.score.toFixed(4)}`))

    console.log('5) related to multi0001 / section s1 (Hooks) — expect sibling s2 (Effects)…')
    const sib = await req('related', { noteId: 'multi0001', sectionId: 's1', k: 5 })
    sib.forEach((r, i) => console.log(`   #${i + 1} ${r.noteId} "${r.title}" [${r.sectionName}] score=${r.score.toFixed(4)}`))

    // Assertions
    clearTimeout(timeout)
    const topHit = hits[0]?.noteId
    const ok =
      String(topHit).startsWith('react') &&                       // search finds a React note, not cooking
      rel.length > 0 &&
      !rel.some((r) => r.noteId === 'react0001' && r.sectionId === 's1') && // never the active section itself
      !rel.some((r) => String(r.noteId).startsWith('cook')) &&    // cooking filtered out
      sib.some((r) => r.noteId === 'multi0001' && r.sectionId === 's2') // same-note sibling section relates

    if (ok) { console.log('\n✅ PASS — section-level related (incl. same-note siblings) works end to end'); cleanup(0) }
    else fail(`Unexpected. topHit=${topHit} rel=${JSON.stringify(rel.map((r) => r.noteId + '/' + r.sectionId))} sib=${JSON.stringify(sib.map((r) => r.noteId + '/' + r.sectionId))}`)
  } catch (err) {
    clearTimeout(timeout)
    fail(String(err && err.stack || err))
  }
})
