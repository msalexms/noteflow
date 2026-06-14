// Headless smoke test for the v1→v2 format migration + folder format round-trip.
// Run with: node scripts/format-migration-smoke.cjs
// Validates: flat .md → folder conversion (sections, legacy body, encrypted),
// `updated` preservation, marker, idempotency, and parse/serialize round-trip.
const fs = require('fs')
const path = require('path')
const os = require('os')

const { migrateNotesDirToV2 } = require('../dist-electron/migration.js')
const noteFormat = require('../dist-electron/noteFormat.js')

const TMP = path.join(os.tmpdir(), 'noteflow-format-migration-smoke')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })

let failures = 0
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`)
  else { console.error(`  ✗ ${name}`); failures++ }
}

// ── Fixture: v1 flat notes ────────────────────────────────────────────────────

// 1. Modern v1: sections inline in frontmatter (block scalars)
fs.writeFileSync(path.join(TMP, 'proyecto-alpha-abc12345.md'), `---
id: abc12345
title: "Proyecto Alpha"
tags: [react, "espacio raro"]
created: 2025-01-01T00:00:00.000Z
updated: 2025-06-01T12:00:00.000Z
sections:
  - id: sec001
    name: Note
    content: |
      Primera línea
      Segunda línea con #react
    isRawMode: true
  - id: sec002
    name: Tasks
    content: |-
      - [ ] tarea pendiente
favorited: true
group: grp001
---
Primera línea
Segunda línea con #react
`, 'utf-8')

// 2. Oldest legacy: plain body, no sections, no id
fs.writeFileSync(path.join(TMP, 'vieja-nota.md'), `Una nota antigua sin frontmatter.
Solo cuerpo.
`, 'utf-8')

// 3. Encrypted v1 note
fs.writeFileSync(path.join(TMP, 'secreta-zz999999.md'), `---
id: zz999999
title: "Secreta"
tags: []
created: 2025-02-02T00:00:00.000Z
updated: 2025-02-03T00:00:00.000Z
encryption:
  alg: aes-256-gcm+pbkdf2
  salt: c2FsdA
  iv: aXZpdml2aXZpdg
  ciphertext: Y2lwaGVy
---
`, 'utf-8')

// 4. Root metadata + README must be untouched
fs.writeFileSync(path.join(TMP, 'groups.json'), '[]', 'utf-8')
fs.writeFileSync(path.join(TMP, 'README.md'), '# readme', 'utf-8')

// ── Run migration ─────────────────────────────────────────────────────────────

console.log('1) migrate v1 → v2')
const res = migrateNotesDirToV2(TMP)
check('migrated 3 notes, 0 errors', res.migrated === 3 && res.errors.length === 0)
check('flat files removed', !fs.existsSync(path.join(TMP, 'proyecto-alpha-abc12345.md')) &&
  !fs.existsSync(path.join(TMP, 'vieja-nota.md')) && !fs.existsSync(path.join(TMP, 'secreta-zz999999.md')))
check('README.md untouched', fs.readFileSync(path.join(TMP, 'README.md'), 'utf-8') === '# readme')
check('marker written', noteFormat.hasFormatMarker(TMP))

console.log('2) converted folder: sections note')
const alpha = noteFormat.parseNoteDir(path.join(TMP, 'proyecto-alpha-abc12345'))
check('id preserved', alpha?.id === 'abc12345')
check('updated preserved', alpha?.updated === '2025-06-01T12:00:00.000Z')
check('2 sections', alpha?.sections.length === 2)
check('section 1 content', alpha?.sections[0].content === 'Primera línea\nSegunda línea con #react\n')
check('section 1 isRawMode', alpha?.sections[0].isRawMode === true)
check('section 2 content (chomped)', alpha?.sections[1].content === '- [ ] tarea pendiente')
check('section files exist', fs.existsSync(path.join(TMP, 'proyecto-alpha-abc12345', 'sec001.md')) &&
  fs.existsSync(path.join(TMP, 'proyecto-alpha-abc12345', 'sec002.md')))
check('favorited/group preserved', alpha?.favorited === true && alpha?.group === 'grp001')
const alphaAnchor = fs.readFileSync(path.join(TMP, 'proyecto-alpha-abc12345', 'note.md'), 'utf-8')
check('note.md has no inline content', !alphaAnchor.includes('Primera línea'))
check('note.md has formatVersion 2', /formatVersion:\s*2/.test(alphaAnchor))

console.log('3) converted folder: legacy plain note')
const vieja = noteFormat.parseNoteDir(path.join(TMP, 'vieja-nota'))
check('legacy got 1 section with body', vieja?.sections.length === 1 &&
  vieja?.sections[0].content === 'Una nota antigua sin frontmatter.\nSolo cuerpo.\n')

console.log('4) converted folder: encrypted note')
const secretaDir = path.join(TMP, 'secreta-zz999999')
const secreta = noteFormat.parseNoteDir(secretaDir)
check('encrypted: only note.md', fs.readdirSync(secretaDir).length === 1)
check('encrypted: block preserved', !!secreta?.encryption &&
  fs.readFileSync(path.join(secretaDir, 'note.md'), 'utf-8').includes('ciphertext: Y2lwaGVy'))
check('encrypted: no sections', secreta?.sections.length === 0)

console.log('5) idempotency: re-run is a no-op')
const res2 = migrateNotesDirToV2(TMP)
check('second run migrates 0', res2.migrated === 0 && res2.errors.length === 0)

console.log('6) serialize/parse round-trip')
const rt = {
  id: 'rt000001', title: 'Round trip "quotes"', tags: ['a'],
  created: '2025-03-03T00:00:00.000Z', updated: '2025-03-04T00:00:00.000Z',
  archived: true,
  sections: [
    { id: 's1', name: 'Note', content: 'line1\nline2\n', isRawMode: true },
    { id: 's2', name: 'Código', content: '```js\nconst x = 1\n```' },
  ],
}
const { files } = noteFormat.serializeNoteFolder(rt, { preserveUpdated: true })
const rtDir = path.join(TMP, 'round-trip-rt000001')
fs.mkdirSync(rtDir, { recursive: true })
for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(rtDir, f), c, 'utf-8')
const back = noteFormat.parseNoteDir(rtDir)
check('round-trip meta', back?.id === rt.id && back?.title === rt.title && back?.updated === rt.updated && back?.archived === true)
check('round-trip sections', JSON.stringify(back?.sections) === JSON.stringify(rt.sections.map(s => ({
  id: s.id, name: s.name, content: s.content, ...(s.isRawMode ? { isRawMode: true } : {}),
}))))

console.log('7) listNoteDirs ignores root files')
const dirs = noteFormat.listNoteDirs(TMP).sort()
check('4 note dirs', dirs.length === 4)

if (failures === 0) { console.log('\n✅ PASS — format migration + round-trip OK'); process.exit(0) }
console.error(`\n❌ FAIL — ${failures} check(s) failed`)
process.exit(1)
