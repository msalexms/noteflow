// Interop guard for the CLI's NoteFlow Cloud client: cli/noteflow.js ports the
// crypto of electron/cloudCrypto.ts and the row mapping of
// electron/cloudSyncLogic.ts to dependency-free JS. Rows written by one side
// MUST decrypt on the other (same DEK), and both must derive the same opaque
// path_key — otherwise the CLI would silently fork a second corpus per file.
// The CLI exposes its pure functions via conditional module.exports (only when
// required as a module, never when run as a script).
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import {
  generateDek,
  generateNoteKey,
  generateKdfSalt,
  generateRecoveryCode,
  normalizeRecoveryCode,
  deriveKek,
  deriveRecoveryKek,
  wrapKey,
  derivePathKeyHmac,
} from '../../electron/cloudCrypto'
import {
  CLOUD_METADATA_FILENAMES,
  buildFileUpsertRow,
  decryptFileRow,
  isSafeCloudRelPath,
  resolveRowUpdatedAt,
  nextPullCursor,
} from '../../electron/cloudSyncLogic'

const require = createRequire(import.meta.url)
const cli = require('../../cli/noteflow.js')

// Fewer PBKDF2 rounds — the test only needs both sides to agree, not hardness.
const FAST_ITERATIONS = 1_000

const REL_PATH = 'my-note-abc123XY/note.md'
const CONTENT = '---\nid: "abc123XY"\nupdated: "2026-07-16T10:00:00.000Z"\n---\nhola çñ 😀'
const UPDATED_AT = '2026-07-16T10:00:00.000Z'

describe('CLI cloud crypto interop with the app', () => {
  it('derives the same path_key for the same DEK + relPath', async () => {
    const dek = generateDek()
    expect(await cli.derivePathKeyHmac(dek, REL_PATH)).toBe(await derivePathKeyHmac(dek, REL_PATH))
  })

  it('decrypts an app-built row with the CLI (and reads back the note key)', async () => {
    const dek = generateDek()
    const noteKey = generateNoteKey()
    const row = await buildFileUpsertRow(dek, noteKey, REL_PATH, CONTENT, UPDATED_AT)
    const entry = await cli.decryptFileRow(dek, row)
    expect(entry.relPath).toBe(REL_PATH)
    expect(entry.content).toBe(CONTENT)
    expect(entry.updatedAt).toBe(UPDATED_AT)
    expect(Buffer.from(entry.noteKey)).toEqual(Buffer.from(noteKey))
  })

  it('decrypts a CLI-built row with the app, with identical path_key', async () => {
    const dek = generateDek()
    const noteKey = generateNoteKey()
    const rowCli = await cli.buildFileUpsertRow(dek, noteKey, REL_PATH, CONTENT, UPDATED_AT)
    const rowApp = await buildFileUpsertRow(dek, noteKey, REL_PATH, CONTENT, UPDATED_AT)
    expect(rowCli.path_key).toBe(rowApp.path_key)
    const entry = await decryptFileRow(dek, rowCli)
    expect(entry.relPath).toBe(REL_PATH)
    expect(entry.content).toBe(CONTENT)
    expect(Buffer.from(entry.noteKey)).toEqual(Buffer.from(noteKey))
  })

  it('reads app tombstones as deleted with empty content', async () => {
    const dek = generateDek()
    const row = await buildFileUpsertRow(dek, generateNoteKey(), REL_PATH, CONTENT, UPDATED_AT, true)
    const entry = await cli.decryptFileRow(dek, row)
    expect(entry.deleted).toBe(true)
    expect(entry.content).toBe('')
  })

  it('derives the same passphrase KEK and cross-unwraps the DEK', async () => {
    const dek = generateDek()
    const salt = generateKdfSalt()
    const kekApp = await deriveKek('correct horse battery staple', salt, FAST_ITERATIONS)
    const kekCli = await cli.deriveKek('correct horse battery staple', salt, FAST_ITERATIONS)
    expect(Buffer.from(kekCli)).toEqual(Buffer.from(kekApp))
    // App wraps (user_keys.dek_pass_ct), CLI unwraps — the e2ee unlock path.
    const unwrapped = await cli.unwrapKey(await wrapKey(dek, kekApp), kekCli)
    expect(Buffer.from(unwrapped)).toEqual(Buffer.from(dek))
  })

  it('normalizes recovery codes identically and derives the same recovery KEK', async () => {
    const code = generateRecoveryCode()
    const messy = `  ${code.toLowerCase().split('-').join(' _ ')} `
    expect(cli.normalizeRecoveryCode(messy)).toBe(normalizeRecoveryCode(code))
    expect(cli.looksLikeRecoveryCode(messy)).toBe(true)
    expect(cli.looksLikeRecoveryCode('not a recovery code')).toBe(false)
    const salt = generateKdfSalt()
    const kekApp = await deriveRecoveryKek(code, salt, FAST_ITERATIONS)
    const kekCli = await cli.deriveKek(cli.normalizeRecoveryCode(messy), salt, FAST_ITERATIONS)
    expect(Buffer.from(kekCli)).toEqual(Buffer.from(kekApp))
  })
})

describe('CLI cloud mapping parity with cloudSyncLogic', () => {
  it('mirrors the 6 root metadata filenames', () => {
    expect([...cli.CLOUD_METADATA_FILES]).toEqual([...CLOUD_METADATA_FILENAMES])
  })

  it('agrees on safe/unsafe decrypted relPaths', () => {
    const cases = [
      'a/note.md',
      'dir/sec.md',
      '../evil.md',
      'a/b/c.md',
      'a\\b.md',
      '/abs.md',
      'groups.json',
      'templates.json',
      'settings.json',
      'a/no-md.txt',
      '',
    ]
    for (const p of cases) expect(cli.isSafeCloudRelPath(p), p).toBe(isSafeCloudRelPath(p))
  })

  it('agrees on row updated_at resolution and pull-cursor advancement', () => {
    const anchor = '---\nupdated: "2026-01-02T03:04:05.000Z"\n---\n'
    const now = '2026-07-16T00:00:00.000Z'
    for (const [rel, content, anchorContent] of [
      ['d/note.md', anchor, null],
      ['d/sec.md', 'body', anchor],
      ['groups.json', '[]', null],
      ['d/sec.md', 'body', 'no frontmatter'],
    ] as const) {
      expect(cli.resolveRowUpdatedAt(rel, content, anchorContent, now)).toBe(
        resolveRowUpdatedAt(rel, content, anchorContent, now)
      )
    }
    const entries = [{ updatedAt: '2026-01-01T00:00:00.000Z' }, { updatedAt: '2026-02-01T00:00:00.000Z' }]
    expect(cli.nextPullCursor(undefined, entries)).toBe(nextPullCursor(undefined, entries))
    expect(cli.nextPullCursor('2026-03-01T00:00:00.000Z', entries)).toBe(
      nextPullCursor('2026-03-01T00:00:00.000Z', entries)
    )
  })
})
