// How `noteflow add` picks its target section. Two deliberately different rules
// live in cmdAdd and this is the regression net for both:
//  - an EXPLICIT --section resolves like `set` (exact → substring → '#n'), so a
//    partial name lands on the existing section instead of duplicating it;
//  - the IMPLICIT default 'Note' (no --section given) is exact-or-create, because
//    substring matching would silently divert the daily append to an unrelated
//    section — or abort as ambiguous with no way for the user to opt out.
// Driven through the real CLI in --dry-run (writes nothing, syncs nothing) with
// NOTEFLOW_NOTES_DIR pointed at a throwaway dir.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../cli/noteflow.js')

let notesDir: string

/** Title of today's daily note, same format cmdAdd derives (DD-MM-YYYY). */
function todayTitle(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

/** Writes a v2 note folder (anchor + one .md per section) into the temp notes dir. */
function writeNote(title: string, sectionNames: string[]) {
  const id = 'testid01'
  const dir = path.join(notesDir, `note-${id}`)
  fs.mkdirSync(dir, { recursive: true })
  const index = sectionNames
    .map((name, i) => `  - id: "sec${i}"\n    name: "${name}"\n    file: "sec${i}.md"\n    isRawMode: true`)
    .join('\n')
  fs.writeFileSync(
    path.join(dir, 'note.md'),
    `---\nid: "${id}"\ntitle: "${title}"\ntags: []\ncreated: "2026-07-01T10:00:00.000Z"\n`
      + `updated: "2026-07-01T10:00:00.000Z"\nformatVersion: 2\nsections:\n${index}\n---\n`,
    'utf-8',
  )
  sectionNames.forEach((_, i) => fs.writeFileSync(path.join(dir, `sec${i}.md`), 'body\n', 'utf-8'))
}

type Run = { status: number; stdout: string; stderr: string }

function run(args: string[]): Run {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, NOTEFLOW_NOTES_DIR: notesDir, NOTEFLOW_NO_APP_CHECK: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, stdout, stderr: '' }
  } catch (e) {
    const x = e as { status: number; stdout: string; stderr: string }
    return { status: x.status, stdout: x.stdout ?? '', stderr: x.stderr ?? '' }
  }
}

/** `add ... --dry-run --json`: nothing is written, the resolved target comes back as JSON. */
function addDryRun(args: string[]) {
  const r = run(['add', 'hello', '--dry-run', '--json', ...args])
  expect(r.status, r.stderr).toBe(0)
  return JSON.parse(r.stdout) as { section: string; createdSection: boolean }
}

beforeEach(() => {
  notesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noteflow-cli-test-'))
  fs.writeFileSync(path.join(notesDir, '.noteflow-format'), '2', 'utf-8')
})

afterEach(() => {
  fs.rmSync(notesDir, { recursive: true, force: true })
})

describe('add without --section (implicit "Note")', () => {
  it('creates "Note" instead of appending to a section that merely contains the word', () => {
    writeNote(todayTitle(), ['Meeting Notes', 'Ideas'])
    expect(addDryRun([])).toMatchObject({ section: 'Note', createdSection: true })
  })

  it('does not abort as ambiguous when several sections contain "Note"', () => {
    writeNote(todayTitle(), ['Meeting Notes', 'Notes de la reunion'])
    expect(addDryRun([])).toMatchObject({ section: 'Note', createdSection: true })
  })

  it('still reuses an exact (case-insensitive) "Note" section', () => {
    writeNote(todayTitle(), ['note', 'Ideas'])
    expect(addDryRun([])).toMatchObject({ section: 'note', createdSection: false })
  })
})

describe('add with an explicit --section', () => {
  it('lands on the existing section by substring instead of duplicating it', () => {
    writeNote('Project Alpha', ['Note', 'Variables Entorno'])
    expect(addDryRun(['--title', 'Project Alpha', '--section', 'Variables']))
      .toMatchObject({ section: 'Variables Entorno', createdSection: false })
  })

  it('creates the section when nothing matches', () => {
    writeNote('Project Alpha', ['Note'])
    expect(addDryRun(['--title', 'Project Alpha', '--section', 'Deploy']))
      .toMatchObject({ section: 'Deploy', createdSection: true })
  })

  it('picks a same-named section with the 1-based #n suffix', () => {
    writeNote('Project Alpha', ['Tasks', 'Tasks'])
    expect(addDryRun(['--title', 'Project Alpha', '--section', 'Tasks#2']))
      .toMatchObject({ section: 'Tasks', createdSection: false })
  })

  it('fails on an ambiguous partial name rather than guessing', () => {
    writeNote('Project Alpha', ['Tasks backend', 'Tasks frontend'])
    const r = run(['add', 'hello', '--dry-run', '--json', '--title', 'Project Alpha', '--section', 'Tasks'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Ambiguous section "Tasks"')
  })

  it('does not use the loose word matching reserved for read/path', () => {
    writeNote('Project Alpha', ['Note', 'Variables Entorno'])
    expect(addDryRun(['--title', 'Project Alpha', '--section', 'Variables de entorno']))
      .toMatchObject({ section: 'Variables de entorno', createdSection: true })
  })
})
