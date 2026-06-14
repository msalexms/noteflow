// Headless smoke test for the brain graph's content edges (ai:graph → contentEdges).
// Run with: unset ELECTRON_RUN_AS_NODE; npx electron scripts/ai-graph-smoke.cjs
// Validates: per-note centroid similarity groups topically-related notes (React vs cooking)
// and prunes cross-cluster noise.
const { app, utilityProcess } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

const WORKER = path.join(__dirname, '..', 'dist-electron', 'ai', 'aiWorker.js')
const TMP = path.join(os.tmpdir(), 'noteflow-ai-graph-smoke')
const DB = path.join(TMP, 'index.db')
const CACHE = path.join(TMP, 'models')

fs.mkdirSync(TMP, { recursive: true })
for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.rmSync(f, { force: true }) } catch {} }

// Format v2: one folder per note (note.md anchor + one .md per section)
function writeNoteDir(dirname, id, title, body) {
  const dirPath = path.join(TMP, dirname)
  fs.rmSync(dirPath, { recursive: true, force: true })
  fs.mkdirSync(dirPath, { recursive: true })
  fs.writeFileSync(path.join(dirPath, 'note.md'),
    `---\nid: ${id}\ntitle: "${title}"\ntags: []\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\nformatVersion: 2\nsections:\n  - id: s1\n    name: Note\n    file: s1.md\n---\n`, 'utf-8')
  fs.writeFileSync(path.join(dirPath, 's1.md'), body, 'utf-8')
  return dirPath
}

const NOTES = [
  { dir: 'a-react0001', id: 'react0001', title: 'React hooks', body: 'useEffect runs after every render. Use useState to hold component state and useMemo to memoize values.' },
  { dir: 'b-react0002', id: 'react0002', title: 'Cleaning up effects', body: 'When a component unmounts you should clean up subscriptions and timers by returning a cleanup function from the effect.' },
  { dir: 'c-react0003', id: 'react0003', title: 'Custom hooks', body: 'Extract reusable logic into custom hooks. useCallback and useRef help build stable hook APIs in React.' },
  { dir: 'd-cook0001', id: 'cook0001', title: 'Cooking pasta', body: 'Boil water, add salt, cook the spaghetti for nine minutes, then drain it in a colander.' },
  { dir: 'e-cook0002', id: 'cook0002', title: 'Pizza dough', body: 'Mix flour, water, yeast and salt. Knead the dough and let it rise for two hours before baking.' },
  { dir: 'f-cook0003', id: 'cook0003', title: 'Green salad', body: 'Chop lettuce, tomato and cucumber. Toss with olive oil, vinegar and a pinch of salt.' },
]

let child
let nextId = 1
const pending = new Map()
const req = (type, payload) => {
  const id = nextId++
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); child.postMessage({ type, id, payload }) })
}
const fail = (msg) => { console.error('❌', msg); cleanup(1) }
const cleanup = (code) => { try { child && child.kill() } catch {} app.exit(code) }

const cluster = (id) => String(id).replace(/[0-9]+$/, '')

app.whenReady().then(async () => {
  child = utilityProcess.fork(WORKER, [], { serviceName: 'noteflow-ai-graph-smoke' })
  child.on('message', (msg) => {
    if (msg.type === 'result') { pending.get(msg.id)?.resolve(msg.payload); pending.delete(msg.id) }
    else if (msg.type === 'error') { pending.get(msg.id)?.reject(new Error(msg.error)); pending.delete(msg.id) }
    else if (msg.type === 'state') console.log('   · state:', msg.payload)
  })
  child.on('exit', (code) => console.log('worker exited', code))

  const timeout = setTimeout(() => fail('TIMEOUT'), 180000)
  try {
    await new Promise((r) => child.once('spawn', r))
    console.log('1) init…')
    await req('init', { modelId: 'Xenova/paraphrase-multilingual-mpnet-base-v2', cacheDir: CACHE, dbPath: DB })
    // index-note is a no-op while the model is dormant — load it explicitly
    await req('load-model', {})

    console.log(`2) indexing ${NOTES.length} notes…`)
    for (const n of NOTES) {
      const dirPath = writeNoteDir(n.dir, n.id, n.title, n.body)
      await req('index-note', { dirPath })
    }

    console.log('3) graph contentEdges…')
    const edges = await req('graph', {})
    edges.sort((a, b) => b.score - a.score)
    for (const e of edges) console.log(`   ${e.a} ↔ ${e.b}  ${e.score.toFixed(4)}  ${cluster(e.a) === cluster(e.b) ? 'within' : 'CROSS'}`)

    clearTimeout(timeout)
    const within = edges.filter((e) => cluster(e.a) === cluster(e.b))
    const cross = edges.filter((e) => cluster(e.a) !== cluster(e.b))
    const reactLinked = within.some((e) => cluster(e.a) === 'react')
    const cookLinked = within.some((e) => cluster(e.a) === 'cook')
    const topIsWithin = edges.length > 0 && cluster(edges[0].a) === cluster(edges[0].b)

    const ok = edges.length > 0 && reactLinked && cookLinked && topIsWithin && within.length >= cross.length
    if (ok) {
      console.log(`\n✅ PASS — ${edges.length} edges (${within.length} within / ${cross.length} cross); clusters connect, top edge is within-cluster`)
      cleanup(0)
    } else {
      fail(`Unexpected. within=${within.length} cross=${cross.length} reactLinked=${reactLinked} cookLinked=${cookLinked} topIsWithin=${topIsWithin}`)
    }
  } catch (err) {
    clearTimeout(timeout)
    fail(String((err && err.stack) || err))
  }
})
