import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { migrateNotesDirToV2 } from '../../electron/migration'
import { NOTE_MD, FORMAT_MARKER_FILE, parseNoteDir } from '../../electron/noteFormat'

// migration.ts imports only fs/path and noteFormat (no electron), so it runs
// under Vitest's node environment. Each test works on a real temp dir.

const tmpDirs: string[] = []

function makeNotesDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-migration-'))
  tmpDirs.push(dir)
  return dir
}

function v1Note(id: string, title: string, body: string): string {
  return [
    '---',
    `id: ${id}`,
    `title: ${title}`,
    `created: 2024-01-01T00:00:00.000Z`,
    `updated: 2024-01-02T00:00:00.000Z`,
    '---',
    body,
  ].join('\n')
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
})

describe('migrateNotesDirToV2', () => {
  it('returns a { migrated, errors } shape', () => {
    const dir = makeNotesDir()
    const result = migrateNotesDirToV2(dir)
    expect(result).toEqual({ migrated: 0, errors: [] })
  })

  it('migrates flat v1 .md files into v2 note folders', () => {
    const dir = makeNotesDir()
    fs.writeFileSync(path.join(dir, 'first-aaa.md'), v1Note('aaa', 'First', 'hello one'), 'utf-8')
    fs.writeFileSync(path.join(dir, 'second-bbb.md'), v1Note('bbb', 'Second', 'hello two'), 'utf-8')

    const result = migrateNotesDirToV2(dir)
    expect(result.migrated).toBe(2)
    expect(result.errors).toEqual([])

    // Flat files are gone, folders exist with a note.md
    expect(fs.existsSync(path.join(dir, 'first-aaa.md'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'first-aaa', NOTE_MD))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'second-bbb', NOTE_MD))).toBe(true)

    // Format marker written
    expect(fs.existsSync(path.join(dir, FORMAT_MARKER_FILE))).toBe(true)

    // Folder parses back to the original note
    const parsed = parseNoteDir(path.join(dir, 'first-aaa'))
    expect(parsed).not.toBeNull()
    expect(parsed!.id).toBe('aaa')
    expect(parsed!.title).toBe('First')
    expect(parsed!.sections[0].content).toBe('hello one')
  })

  it('preserves the updated timestamp (no spurious bump during migration)', () => {
    const dir = makeNotesDir()
    fs.writeFileSync(path.join(dir, 'kept-ccc.md'), v1Note('ccc', 'Kept', 'body'), 'utf-8')

    migrateNotesDirToV2(dir)
    const noteMd = fs.readFileSync(path.join(dir, 'kept-ccc', NOTE_MD), 'utf-8')
    expect(noteMd).toContain('2024-01-02T00:00:00.000Z')
  })

  it('is idempotent: re-running does not migrate again or break the folders', () => {
    const dir = makeNotesDir()
    fs.writeFileSync(path.join(dir, 'idem-ddd.md'), v1Note('ddd', 'Idem', 'body'), 'utf-8')

    const first = migrateNotesDirToV2(dir)
    expect(first.migrated).toBe(1)

    const second = migrateNotesDirToV2(dir)
    expect(second.migrated).toBe(0)
    expect(second.errors).toEqual([])
    // Folder still intact and parseable
    expect(parseNoteDir(path.join(dir, 'idem-ddd'))!.id).toBe('ddd')
  })

  it('ignores README.md and returns gracefully on a missing dir', () => {
    const dir = makeNotesDir()
    fs.writeFileSync(path.join(dir, 'README.md'), '# readme', 'utf-8')
    const result = migrateNotesDirToV2(dir)
    expect(result.migrated).toBe(0)
    expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true)

    const missing = migrateNotesDirToV2(path.join(dir, 'does-not-exist'))
    expect(missing).toEqual({ migrated: 0, errors: [] })
  })
})
