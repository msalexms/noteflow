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

const note = (id, title, body) =>
  `---\nid: ${id}\ntitle: "${title}"\ntags: []\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\nsections:\n  - id: s1\n    name: Note\n    content: |\n      ${body}\n---\n${body}\n`

const NOTES = [
  { fp: path.join(TMP, 'a.md'), id: 'react0001', content: note('react0001', 'React hooks', 'useEffect runs after every render. Use useState to hold component state and useMemo to memoize values.') },
  { fp: path.join(TMP, 'b.md'), id: 'react0002', content: note('react0002', 'Cleaning up effects', 'When a component unmounts you should clean up subscriptions and timers by returning a cleanup function from the effect.') },
  { fp: path.join(TMP, 'c.md'), id: 'react0003', content: note('react0003', 'Custom hooks', 'Extract reusable logic into custom hooks. useCallback and useRef help build stable hook APIs in React.') },
  { fp: path.join(TMP, 'd.md'), id: 'cook0001', content: note('cook0001', 'Cooking pasta', 'Boil water, add salt, cook the spaghetti for nine minutes, then drain it in a colander.') },
  { fp: path.join(TMP, 'e.md'), id: 'cook0002', content: note('cook0002', 'Pizza dough', 'Mix flour, water, yeast and salt. Knead the dough and let it rise for two hours before baking.') },
  { fp: path.join(TMP, 'f.md'), id: 'cook0003', content: note('cook0003', 'Green salad', 'Chop lettuce, tomato and cucumber. Toss with olive oil, vinegar and a pinch of salt.') },
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

    console.log(`2) indexing ${NOTES.length} notes…`)
    for (const n of NOTES) await req('index-note', { filePath: n.fp, content: n.content })

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
