// Embedding-model benchmark for NoteFlow "related".
// Re-embeds the user's REAL notes with several candidate models, computes KPIs, and
// dumps each model's related results for qualitative (LLM) judgement.
// Run: npx electron scripts/ai-bench.cjs
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const yaml = require('js-yaml')

const NOTES_DIR = path.join(os.homedir(), 'noteflow-notes')
const OUT_DIR = path.join(__dirname, 'bench-out')
const CACHE = path.join(__dirname, '..', '.electron-dev', 'ai-models') // reuse already-downloaded models
fs.mkdirSync(OUT_DIR, { recursive: true })

// Candidate models. prefix=true → e5 family needs "passage: " on documents.
const MODELS = [
  { id: 'Xenova/multilingual-e5-small', prefix: true },
  { id: 'Xenova/multilingual-e5-base', prefix: true },
  { id: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', prefix: false },
  { id: 'Xenova/paraphrase-multilingual-mpnet-base-v2', prefix: false },
]

const MIN_SCORE = 0.03
const K = 6

// ── Parse notes (mirrors aiWorker.extractSections) ──────────────────────────
function parseNote(raw) {
  const norm = raw.replace(/\r\n/g, '\n')
  let fm = '', body = norm
  if (norm.startsWith('---\n')) {
    const end = norm.indexOf('\n---\n', 4)
    if (end !== -1) { fm = norm.slice(4, end); body = norm.slice(end + 5) }
  }
  let data = {}
  try { data = yaml.load(fm) || {} } catch {}
  if (data.encryption) return null // skip encrypted
  const noteId = String(data.id || '')
  const title = String(data.title || '')
  let sections = []
  if (Array.isArray(data.sections) && data.sections.length) {
    sections = data.sections.map((s, i) => ({ id: String(s.id ?? `sec${i}`), name: String(s.name ?? 'Section'), content: String(s.content ?? '') }))
  } else {
    sections = [{ id: 'sec0', name: 'Note', content: body }]
  }
  return { noteId, title, sections }
}

function loadSections() {
  const flat = []
  for (const f of fs.readdirSync(NOTES_DIR).filter((x) => x.endsWith('.md'))) {
    const note = parseNote(fs.readFileSync(path.join(NOTES_DIR, f), 'utf-8'))
    if (!note || !note.noteId) continue
    for (const s of note.sections) {
      const text = `${s.name}\n${s.content}`.trim()
      if (!text) continue
      flat.push({ noteId: note.noteId, title: note.title, sectionId: s.id, sectionName: s.name, text })
    }
  }
  return flat
}

// ── Vector math ─────────────────────────────────────────────────────────────
const dot = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d }
function normalize(v) { let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1; const o = new Float32Array(v.length); for (let i = 0; i < v.length; i++) o[i] = v[i] / n; return o }

function meanCenter(vecs) {
  const dim = vecs[0].length
  const mean = new Float32Array(dim)
  for (const v of vecs) for (let i = 0; i < dim; i++) mean[i] += v[i]
  for (let i = 0; i < dim; i++) mean[i] /= vecs.length
  return vecs.map((v) => { const o = new Float32Array(dim); for (let i = 0; i < dim; i++) o[i] = v[i] - mean[i]; return normalize(o) })
}

// related for section index qi over centered vectors
function relatedFor(qi, centered, flat, k = K, minScore = MIN_SCORE) {
  const q = centered[qi]
  const self = flat[qi]
  const bestByNote = new Map()
  const siblings = []
  for (let i = 0; i < centered.length; i++) {
    if (i === qi) continue
    const it = flat[i]
    const score = dot(q, centered[i])
    if (it.noteId === self.noteId) siblings.push({ i, score })
    else { const p = bestByNote.get(it.noteId); if (!p || score > p.score) bestByNote.set(it.noteId, { i, score }) }
  }
  return [...siblings, ...bestByNote.values()].filter((x) => x.score > minScore).sort((a, b) => b.score - a.score).slice(0, k)
}

// ── Embedding ───────────────────────────────────────────────────────────────
async function embedAll(model, texts) {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = CACHE; env.allowRemoteModels = true; env.allowLocalModels = true
  const tLoad0 = Date.now()
  let extractor
  try { extractor = await pipeline('feature-extraction', model.id, { dtype: 'q8' }) }
  catch { extractor = await pipeline('feature-extraction', model.id) }
  const loadMs = Date.now() - tLoad0
  const input = model.prefix ? texts.map((t) => `passage: ${t}`) : texts
  const tEmb0 = Date.now()
  const out = await extractor(input, { pooling: 'mean', normalize: true })
  const embedMs = Date.now() - tEmb0
  const list = out.tolist()
  return { vecs: list.map((a) => Float32Array.from(a)), loadMs, embedMs, dim: list[0].length }
}

// ── Run ─────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const flat = loadSections()
  console.log(`Loaded ${flat.length} sections from ${flat.reduce((s, x) => s.add(x.noteId), new Set()).size} notes\n`)
  const summary = []

  for (const model of MODELS) {
    console.log(`\n===== ${model.id} =====`)
    let res
    try { res = await embedAll(model, flat.map((s) => s.text)) }
    catch (e) { console.error('FAILED', model.id, String(e).split('\n')[0]); continue }
    const { vecs, loadMs, embedMs, dim } = res

    // raw anisotropy: mean pairwise cosine of normalized raw vectors
    let pairs = 0, cosSum = 0
    for (let i = 0; i < vecs.length; i++) for (let j = i + 1; j < vecs.length; j++) { cosSum += dot(vecs[i], vecs[j]); pairs++ }
    const anisotropy = cosSum / pairs

    const centered = meanCenter(vecs)

    let top1Sum = 0, marginSum = 0, covered = 0, countSum = 0
    const dump = [`# ${model.id}`, `dim=${dim} · load=${(loadMs / 1000).toFixed(1)}s · embed=${embedMs}ms (${(embedMs / flat.length).toFixed(0)}ms/section)`, `raw anisotropy=${anisotropy.toFixed(3)} (lower = better separation)`, '']
    // group dump by note
    const byNote = new Map()
    for (let qi = 0; qi < flat.length; qi++) {
      const rel = relatedFor(qi, centered, flat)
      const top1 = rel[0]?.score ?? 0
      const top2 = rel[1]?.score ?? 0
      top1Sum += top1; marginSum += (top1 - top2); countSum += rel.length
      if (rel.length > 0) covered++
      const src = flat[qi]
      const line = [`- **[${src.sectionName}]** “${src.text.replace(/\s+/g, ' ').slice(0, 50)}…”`]
      for (const r of rel.slice(0, 3)) {
        const t = flat[r.i]
        const same = t.noteId === src.noteId ? ' (this note)' : ''
        line.push(`    ${r.score.toFixed(3)} → ${t.title || 'Untitled'} [${t.sectionName}]${same} · “${t.text.replace(/\s+/g, ' ').slice(0, 45)}…”`)
      }
      if (!byNote.has(src.title)) byNote.set(src.title, [])
      byNote.get(src.title).push(line.join('\n'))
    }
    for (const [title, lines] of byNote) { dump.push(`## ${title}`); dump.push(...lines, '') }

    const n = flat.length
    const kpi = {
      model: model.id, dim,
      loadS: +(loadMs / 1000).toFixed(1), embedMsPerSec: +(embedMs / n).toFixed(0),
      anisotropy: +anisotropy.toFixed(3),
      avgTop1: +(top1Sum / n).toFixed(3), avgMargin: +(marginSum / n).toFixed(3),
      coveragePct: +(100 * covered / n).toFixed(0), avgRelated: +(countSum / n).toFixed(1),
    }
    summary.push(kpi)
    console.log(kpi)
    fs.writeFileSync(path.join(OUT_DIR, model.id.replace(/\//g, '_') + '.md'), dump.join('\n'), 'utf-8')
  }

  fs.writeFileSync(path.join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2), 'utf-8')
  console.log('\n================ KPI SUMMARY ================')
  console.table(summary)
  console.log('dumps written to', OUT_DIR)
  app.exit(0)
})
