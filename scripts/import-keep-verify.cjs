/**
 * Controlled verification of the Google Keep import pipeline. Keep notes are
 * plain markdown (no DOM needed), so this runs the REAL renderer serialization
 * (serializeNoteFolder / noteDirname, bundled with esbuild) in plain node and
 * writes the result to a temp notes dir, mirroring buildEntriesFromExternal +
 * notes:write-imported (empties skipped, rich-text mode, labels → tags).
 *
 *   node scripts/import-keep-verify.cjs [takeout.zip]
 */
const os = require('os')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const esbuild = require('esbuild')
const { parseExternalSource } = require('../dist-electron/importers/index.js')

const ROOT = path.join(__dirname, '..')
const zipPath = process.argv[2] || path.join(os.homedir(), 'Downloads', 'takeout.zip')

async function main() {
  if (!fs.existsSync(zipPath)) { console.error(`✗ zip not found: ${zipPath}`); process.exit(1) }

  const { notes } = parseExternalSource('keep', zipPath)
  console.log(`Parsed ${notes.length} Keep notes from ${path.basename(zipPath)}`)

  // Bundle the real serializer for node (serializeNoteFolder is DOM-free).
  const entry = `export { serializeNoteFolder, noteDirname } from ${JSON.stringify(path.join(ROOT, 'src/lib/noteUtils.ts'))}`
  const bundle = await esbuild.build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
    bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
  })
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(mod, mod.exports, require)
  const { serializeNoteFolder, noteDirname } = mod.exports

  // Replicate buildEntriesFromExternal for md notes (externalContent = body.trim()).
  const now = new Date().toISOString()
  const kept = notes.filter((n) => (n.body || '').trim().length > 0)
  const outDir = path.join(os.tmpdir(), `noteflow-keep-verify-${Date.now()}`)
  fs.mkdirSync(outDir, { recursive: true })

  let withTags = 0, archived = 0, favorited = 0
  for (const n of kept) {
    const id = crypto.randomBytes(4).toString('hex')
    const title = (n.title || '').trim() || 'Untitled'
    if (n.tags && n.tags.length) withTags++
    if (n.archived) archived++
    if (n.favorited) favorited++
    const { files } = serializeNoteFolder({
      id, title, tags: n.tags ?? [], created: n.created || now, updated: now,
      archived: !!n.archived, favorited: !!n.favorited,
      sections: [{ id: crypto.randomBytes(3).toString('hex'), name: 'Note', content: n.body.trim(), isRawMode: false }],
    })
    const dir = path.join(outDir, noteDirname(id, title))
    fs.mkdirSync(dir, { recursive: true })
    for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), c, 'utf-8')
  }

  console.log(`Imported ${kept.length} (skipped ${notes.length - kept.length} empty) — ${archived} archived, ${favorited} favorited, ${withTags} with tags.`)
  console.log(`Output: ${outDir}`)

  // Show one full note.md so the frontmatter (no isRawMode → rich text) is visible.
  const sampleDir = fs.readdirSync(outDir)[0]
  console.log(`\n──────── ${sampleDir}/note.md ────────`)
  console.log(fs.readFileSync(path.join(outDir, sampleDir, 'note.md'), 'utf-8'))

  let bad = 0
  for (const d of fs.readdirSync(outDir)) {
    if (!fs.existsSync(path.join(outDir, d, 'note.md'))) { bad++; console.error(`  ✗ missing note.md in ${d}`) }
  }
  console.log(bad === 0 ? '\n✓ all notes serialized with note.md' : `\n✗ ${bad} bad`)
  process.exit(bad === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
