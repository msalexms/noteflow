/**
 * Smoke test for the Notion importer (main-side: zip walking, hex stripping,
 * relPath / group mapping, .csv skipping). HTML→markdown conversion is NOT
 * covered here (it needs the renderer DOM); test that in the running app.
 *
 *   node scripts/import-notion-smoke.cjs [path-to-notion-export.zip]
 *
 * Defaults to the sample export under ~/Downloads/notion_export.zip.
 */
const os = require('os')
const path = require('path')
const fs = require('fs')
const { parseExternalSource } = require('../dist-electron/importers/index.js')

const zip = process.argv[2] || path.join(os.homedir(), 'Downloads', 'notion_export.zip')
if (!fs.existsSync(zip)) {
  console.error(`✗ zip not found: ${zip}`)
  process.exit(1)
}

const { notes } = parseExternalSource('notion', zip)
let failures = 0
const check = (cond, msg) => { if (!cond) { failures++; console.error(`  ✗ ${msg}`) } }

console.log(`Parsed ${notes.length} notes from ${path.basename(zip)}`)
check(notes.length > 0, 'at least one note')

// No 32-hex Notion id should survive in titles or relPath segments.
const HEX = /[0-9a-f]{32}/i
const titleWithHex = notes.find((n) => HEX.test(n.title))
check(!titleWithHex, `no hex in titles (offender: ${titleWithHex?.title})`)
const relWithHex = notes.find((n) => n.relPath.some((s) => HEX.test(s)))
check(!relWithHex, `no hex in relPath (offender: ${relWithHex?.relPath?.join('/')})`)

// Export-* wrapper folders must be stripped from relPath.
const wrapped = notes.find((n) => n.relPath.some((s) => /^Export-/i.test(s)))
check(!wrapped, `no Export-* wrapper in relPath (offender: ${wrapped?.relPath?.join('/')})`)

// Every note carries an HTML body. Untitled Notion pages (filename = bare hex id)
// legitimately have no title — the renderer falls back to "Untitled".
check(notes.every((n) => n.format === 'html'), 'all notes are html format')
check(notes.every((n) => typeof n.body === 'string' && n.body.length > 0), 'all notes have a body')
const untitled = notes.filter((n) => !n.title || !n.title.trim()).length
console.log(`Untitled pages (→ "Untitled"): ${untitled}`)

// Show the group/folder distribution so we can eyeball the structure mapping.
const groups = {}
for (const n of notes) {
  const g = n.relPath[0] || '(ungrouped)'
  groups[g] = (groups[g] || 0) + 1
}
console.log('Groups (relPath[0] → count):')
for (const [g, c] of Object.entries(groups).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${g}: ${c}`)
}

console.log('\nSample (first 5):')
for (const n of notes.slice(0, 5)) {
  console.log(`  • ${n.title}  [${n.relPath.join(' / ') || 'root'}]  (${n.body.length} chars)`)
}

if (failures > 0) { console.error(`\n✗ ${failures} check(s) failed`); process.exit(1) }
console.log('\n✓ all checks passed')
