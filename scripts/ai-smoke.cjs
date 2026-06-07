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

const note = (id, title, body) =>
  `---\nid: ${id}\ntitle: "${title}"\ntags: []\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\nsections:\n  - id: s1\n    name: Note\n    content: |\n      ${body}\n---\n${body}\n`

const NOTES = [
  // Cluster 1: React
  { fp: path.join(TMP, 'a.md'), id: 'react0001', content: note('react0001', 'React hooks', 'useEffect runs after every render. Use useState to hold component state and useMemo to memoize values.') },
  { fp: path.join(TMP, 'b.md'), id: 'react0002', content: note('react0002', 'Cleaning up effects', 'When a component unmounts you should clean up subscriptions and timers by returning a cleanup function from the effect.') },
  { fp: path.join(TMP, 'c.md'), id: 'react0003', content: note('react0003', 'Custom hooks', 'Extract reusable logic into custom hooks. useCallback and useRef help build stable hook APIs in React.') },
  // Cluster 2: cooking
  { fp: path.join(TMP, 'd.md'), id: 'cook0001', content: note('cook0001', 'Cooking pasta', 'Boil water, add salt, cook the spaghetti for nine minutes, then drain it in a colander.') },
  { fp: path.join(TMP, 'e.md'), id: 'cook0002', content: note('cook0002', 'Pizza dough', 'Mix flour, water, yeast and salt. Knead the dough and let it rise for two hours before baking.') },
  { fp: path.join(TMP, 'f.md'), id: 'cook0003', content: note('cook0003', 'Green salad', 'Chop lettuce, tomato and cucumber. Toss with olive oil, vinegar and a pinch of salt.') },
  // Multi-section note: two React-themed sections (tests same-note section relating)
  {
    fp: path.join(TMP, 'g.md'), id: 'multi0001',
    content: `---\nid: multi0001\ntitle: "React deep dive"\nsections:\n  - id: s1\n    name: Hooks\n    content: |\n      useEffect and useState are the core React hooks for state and side effects.\n  - id: s2\n    name: Effects\n    content: |\n      Side effects run inside useEffect; clean them up by returning a function on unmount.\n---\nuseEffect and useState are the core React hooks.\n`,
  },
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

    console.log(`2) indexing ${NOTES.length} notes…`)
    for (const n of NOTES) await req('index-note', { filePath: n.fp, content: n.content })
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
