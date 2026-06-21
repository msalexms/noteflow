/**
 * End-to-end verification of the Notion import pipeline, running the REAL
 * renderer code (htmlToMarkdown + notionBodyToMarkdown + serializeNoteFolder)
 * inside a hidden Electron window (real Chromium DOM), then writing the result
 * to a temp notes dir exactly as the app would. Inspect the printed samples and
 * the output folder to judge conversion quality.
 *
 *   unset ELECTRON_RUN_AS_NODE; npx electron scripts/import-notion-verify.cjs [export.zip]
 */
const os = require('os')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const esbuild = require('esbuild')
const { app, BrowserWindow } = require('electron')
const { parseExternalSource } = require('../dist-electron/importers/index.js')

const ROOT = path.join(__dirname, '..')
const zipPath = process.argv[2] || path.join(os.homedir(), 'Downloads', 'notion_export.zip')

// ── Replicate the renderer's relPath → group/folder mapping (main side) ───────
function buildStructure(notes) {
  const groups = []   // { id, name, color, order }
  const folders = []  // { id, name, groupId, order }
  const groupByName = new Map()
  const folderByKey = new Map()
  const PALETTE = ['--accent', '--accent-2', '--cyan', '--purple', '--orange', '--pink', '--red', '--text']

  function ensureGroup(name) {
    const key = name.toLowerCase()
    if (groupByName.has(key)) return groupByName.get(key)
    const g = { id: crypto.randomBytes(4).toString('hex'), name, color: PALETTE[groups.length % PALETTE.length], order: groups.length }
    groups.push(g); groupByName.set(key, g.id); return g.id
  }
  function ensureFolder(groupId, name) {
    const key = `${groupId} ${name.toLowerCase()}`
    if (folderByKey.has(key)) return folderByKey.get(key)
    const f = { id: crypto.randomBytes(4).toString('hex'), name, groupId, order: folders.length }
    folders.push(f); folderByKey.set(key, f.id); return f.id
  }
  for (const n of notes) {
    if (n.relPath.length === 0) { n._group = undefined; n._folder = undefined; continue }
    const group = ensureGroup(n.relPath[0])
    const folder = n.relPath.length > 1 ? ensureFolder(group, n.relPath.slice(1).join(' / ')) : undefined
    n._group = group; n._folder = folder
  }
  return { groups, folders }
}

async function main() {
  if (!fs.existsSync(zipPath)) { console.error(`✗ zip not found: ${zipPath}`); app.exit(1); return }

  console.log(`Parsing ${path.basename(zipPath)} …`)
  const { notes } = parseExternalSource('notion', zipPath)
  console.log(`  ${notes.length} notes`)
  const { groups, folders } = buildStructure(notes)
  console.log(`  ${groups.length} groups, ${folders.length} folders`)

  // Assign fresh ids in main (renderer would use nanoid; ids are opaque here).
  for (const n of notes) { n._id = crypto.randomBytes(4).toString('hex'); n._sec = crypto.randomBytes(3).toString('hex') }

  // Bundle the real renderer conversion/serialization for injection.
  const entry = `
    export { notionBodyToMarkdown } from ${JSON.stringify(path.join(ROOT, 'src/lib/notionHtml.ts'))}
    export { serializeNoteFolder, noteDirname } from ${JSON.stringify(path.join(ROOT, 'src/lib/noteUtils.ts'))}
  `
  const bundle = await esbuild.build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
    bundle: true, format: 'iife', globalName: '__nf', platform: 'browser', write: false, logLevel: 'silent',
  })
  const bundleCode = bundle.outputFiles[0].text

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('about:blank')
  await win.webContents.executeJavaScript(bundleCode)

  // Convert + serialize in the renderer (real DOM). Pass notes via a global.
  const payload = notes.map((n) => ({
    id: n._id, sec: n._sec, title: n.title, body: n.body,
    group: n._group, folder: n._folder, created: n.created, tags: n.tags || [],
    archived: !!n.archived, favorited: !!n.favorited,
  }))
  win.webContents.executeJavaScript(`window.__payload = ${JSON.stringify(payload)}; true`)

  const result = await win.webContents.executeJavaScript(`(() => {
    const now = new Date().toISOString()
    return window.__payload.map((p) => {
      const content = window.__nf.notionBodyToMarkdown(p.body)
      const { files } = window.__nf.serializeNoteFolder({
        id: p.id, title: p.title || 'Untitled', tags: p.tags,
        created: p.created || now, updated: now,
        archived: p.archived, favorited: p.favorited,
        group: p.group, folder: p.folder,
        sections: [{ id: p.sec, name: 'Note', content, isRawMode: false }],
      })
      const dir = window.__nf.noteDirname(p.id, p.title || 'Untitled')
      return { dir, files, contentLen: content.length, title: p.title || 'Untitled' }
    })
  })()`)

  // Production skips notes with no written content — mirror that here.
  const kept = result.filter((r) => r.contentLen > 0)

  // Write to a temp notes dir, exactly like notes:write-imported would.
  const outDir = path.join(os.tmpdir(), `noteflow-notion-verify-${Date.now()}`)
  fs.mkdirSync(outDir, { recursive: true })
  for (const r of kept) {
    const d = path.join(outDir, r.dir)
    fs.mkdirSync(d, { recursive: true })
    for (const [f, c] of Object.entries(r.files)) fs.writeFileSync(path.join(d, f), c, 'utf-8')
  }
  fs.writeFileSync(path.join(outDir, 'groups.json'), JSON.stringify(groups, null, 2))
  fs.writeFileSync(path.join(outDir, 'folders.json'), JSON.stringify(folders, null, 2))
  fs.writeFileSync(path.join(outDir, '.noteflow-format'), '2')

  // Stats + samples. Distinguish genuinely-empty Notion pages (database rows /
  // title-only items) from real content loss (raw body has text → empty output).
  const rawText = (html) => {
    const m = html.match(/<div class="page-body">([\s\S]*)/i)
    if (!m) return 0
    return m[1].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().length
  }
  let lost = 0
  result.forEach((r, i) => {
    if (r.contentLen === 0 && rawText(notes[i].body) > 20) {
      lost++
      if (lost <= 5) console.error(`  ⚠ content loss: "${r.title}" (raw ${rawText(notes[i].body)} chars → empty)`)
    }
  })
  const empty = result.filter((r) => r.contentLen === 0).length
  console.log(`\nConverted ${result.length} notes — ${empty} empty skipped (${empty - lost} genuinely empty Notion pages, ${lost} content loss).`)
  console.log(`Imported (with content): ${kept.length}`)
  console.log(`Output: ${outDir}`)

  const interesting = ['Clean Code', 'Task List', 'Lista compra', 'Docker']
  for (const needle of interesting) {
    const r = result.find((x) => x.title.includes(needle))
    if (!r) continue
    const md = r.files[Object.keys(r.files).find((f) => f.endsWith('.md') && f !== 'note.md')]
    console.log(`\n──────── ${r.title} ────────`)
    console.log(md.slice(0, 700))
  }

  win.destroy()
  if (lost > 0) console.error(`\n✗ ${lost} note(s) lost content in conversion`)
  else console.log('\n✓ no content loss — all non-empty Notion pages converted')
  app.exit(lost > 0 ? 1 : 0)
}

app.whenReady().then(main).catch((e) => { console.error(e); app.exit(1) })
