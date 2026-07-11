import { describe, it, expect } from 'vitest'
import {
  CLOUD_METADATA_FILENAMES,
  noteDirOf,
  isAnchorPath,
  isSafeCloudRelPath,
  extractUpdatedTimestamp,
  parseUpdatedTimestamp,
  resolveRowUpdatedAt,
  shouldApplyRemoteDir,
  shouldApplyRemoteDeletion,
  groupEntriesByDir,
  nextPullCursor,
  buildFileUpsertRow,
  decryptFileRow,
} from '../../electron/cloudSyncLogic'
import { generateDek, generateNoteKey, derivePathKeyHmac } from '../../electron/cloudCrypto'

const NOW = '2026-07-10T12:00:00.000Z'

const anchorContent = (updated: string) =>
  `---\nid: abc123\ntitle: My note\nupdated: '${updated}'\n---\n`

// ── Path mapping ──────────────────────────────────────────────────────────────

describe('noteDirOf / isAnchorPath', () => {
  it('maps note files to their dir and root files to null', () => {
    expect(noteDirOf('my-note-abc123/note.md')).toBe('my-note-abc123')
    expect(noteDirOf('my-note-abc123/sec001.md')).toBe('my-note-abc123')
    expect(noteDirOf('groups.json')).toBeNull()
  })

  it('identifies the anchor only', () => {
    expect(isAnchorPath('my-note-abc123/note.md')).toBe(true)
    expect(isAnchorPath('my-note-abc123/sec001.md')).toBe(false)
    expect(isAnchorPath('note.md')).toBe(false) // root-level, not a dir anchor
  })
})

describe('isSafeCloudRelPath', () => {
  it('accepts note files one level deep and known root metadata', () => {
    expect(isSafeCloudRelPath('my-note-abc123/note.md')).toBe(true)
    expect(isSafeCloudRelPath('my-note-abc123/sec001.md')).toBe(true)
    for (const f of CLOUD_METADATA_FILENAMES) expect(isSafeCloudRelPath(f)).toBe(true)
  })

  it('rejects traversal, separators and unknown root files', () => {
    expect(isSafeCloudRelPath('../evil.md')).toBe(false)
    expect(isSafeCloudRelPath('dir/../../evil.md')).toBe(false)
    expect(isSafeCloudRelPath('/abs/note.md')).toBe(false)
    expect(isSafeCloudRelPath('dir\\note.md')).toBe(false)
    expect(isSafeCloudRelPath('dir/deeper/note.md')).toBe(false)
    expect(isSafeCloudRelPath('dir/not-markdown.txt')).toBe(false)
    expect(isSafeCloudRelPath('evil.json')).toBe(false)
    expect(isSafeCloudRelPath('')).toBe(false)
  })
})

// ── Timestamps ────────────────────────────────────────────────────────────────

describe('resolveRowUpdatedAt', () => {
  it('anchor rows use their own frontmatter updated (normalized to ISO)', () => {
    const content = anchorContent('2026-07-01T08:30:00.000Z')
    expect(resolveRowUpdatedAt('dir-a/note.md', content, null, NOW)).toBe('2026-07-01T08:30:00.000Z')
  })

  it('section rows inherit the anchor timestamp', () => {
    const anchor = anchorContent('2026-07-02T09:00:00.000Z')
    expect(resolveRowUpdatedAt('dir-a/sec001.md', '# body', anchor, NOW)).toBe('2026-07-02T09:00:00.000Z')
  })

  it('root metadata and missing/unparseable frontmatter fall back to now', () => {
    expect(resolveRowUpdatedAt('groups.json', '[]', null, NOW)).toBe(NOW)
    expect(resolveRowUpdatedAt('dir-a/note.md', 'no frontmatter here', null, NOW)).toBe(NOW)
    expect(resolveRowUpdatedAt('dir-a/sec001.md', '# body', null, NOW)).toBe(NOW)
    expect(resolveRowUpdatedAt('dir-a/note.md', anchorContent('not-a-date'), null, NOW)).toBe(NOW)
  })

  it('extract/parse helpers behave like the GitHub sync ones', () => {
    expect(extractUpdatedTimestamp(anchorContent('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01T00:00:00.000Z')
    expect(extractUpdatedTimestamp('nothing')).toBeNull()
    expect(parseUpdatedTimestamp('2026-01-01T00:00:00.000Z')).toBe(Date.parse('2026-01-01T00:00:00.000Z'))
    expect(parseUpdatedTimestamp('garbage')).toBeNull()
    expect(parseUpdatedTimestamp(null)).toBeNull()
  })
})

// ── Conflict decisions ────────────────────────────────────────────────────────

describe('shouldApplyRemoteDir', () => {
  it('newer remote wins; equal or older does not', () => {
    expect(shouldApplyRemoteDir(2000, 1000)).toBe(true)
    expect(shouldApplyRemoteDir(1000, 1000)).toBe(false)
    expect(shouldApplyRemoteDir(500, 1000)).toBe(false)
  })

  it('missing local applies; unparseable remote never applies', () => {
    expect(shouldApplyRemoteDir(2000, null)).toBe(true)
    expect(shouldApplyRemoteDir(null, 1000)).toBe(false)
    expect(shouldApplyRemoteDir(null, null)).toBe(false)
  })
})

describe('shouldApplyRemoteDeletion', () => {
  it('deletes only when the local copy predates the last sync', () => {
    expect(shouldApplyRemoteDeletion(1000, 2000)).toBe(true)
    expect(shouldApplyRemoteDeletion(2000, 2000)).toBe(true)
    expect(shouldApplyRemoteDeletion(3000, 2000)).toBe(false) // newer local edit wins
  })

  it('never deletes on the first reconcile or with unknown local age', () => {
    expect(shouldApplyRemoteDeletion(1000, null)).toBe(false)
    expect(shouldApplyRemoteDeletion(null, 2000)).toBe(false)
  })
})

// ── Pull grouping / cursor ────────────────────────────────────────────────────

describe('groupEntriesByDir', () => {
  it('splits entries into note-dir groups and root files', () => {
    const entries = [
      { relPath: 'dir-a/note.md' },
      { relPath: 'dir-a/sec001.md' },
      { relPath: 'dir-b/note.md' },
      { relPath: 'groups.json' },
    ]
    const { dirs, rootFiles } = groupEntriesByDir(entries)
    expect([...dirs.keys()].sort()).toEqual(['dir-a', 'dir-b'])
    expect(dirs.get('dir-a')).toHaveLength(2)
    expect(rootFiles.map((e) => e.relPath)).toEqual(['groups.json'])
  })
})

describe('nextPullCursor', () => {
  it('advances to the max updated_at seen', () => {
    const cursor = nextPullCursor('2026-07-01T00:00:00.000Z', [
      { updatedAt: '2026-07-03T00:00:00.000Z' },
      { updatedAt: '2026-07-02T00:00:00.000Z' },
    ])
    expect(cursor).toBe('2026-07-03T00:00:00.000Z')
  })

  it('keeps the current cursor when entries are older or unparseable', () => {
    expect(nextPullCursor('2026-07-05T00:00:00.000Z', [{ updatedAt: '2026-07-01T00:00:00.000Z' }]))
      .toBe('2026-07-05T00:00:00.000Z')
    expect(nextPullCursor('2026-07-05T00:00:00.000Z', [{ updatedAt: 'garbage' }]))
      .toBe('2026-07-05T00:00:00.000Z')
    expect(nextPullCursor(undefined, [])).toBeUndefined()
  })

  it('starts from scratch without a cursor', () => {
    expect(nextPullCursor(undefined, [{ updatedAt: '2026-07-01T00:00:00.000Z' }]))
      .toBe('2026-07-01T00:00:00.000Z')
  })
})

// ── Row crypto (file ↔ files-table row) ───────────────────────────────────────

describe('buildFileUpsertRow / decryptFileRow', () => {
  it('round-trips a file through an encrypted row', async () => {
    const dek = generateDek()
    const noteKey = generateNoteKey()
    const relPath = 'mi-nota-abc123/note.md'
    const content = anchorContent('2026-07-01T08:30:00.000Z')

    const row = await buildFileUpsertRow(dek, noteKey, relPath, content, '2026-07-01T08:30:00.000Z')
    expect(row.path_key).toBe(await derivePathKeyHmac(dek, relPath))
    expect(row.deleted).toBe(false)
    expect(row.updated_at).toBe('2026-07-01T08:30:00.000Z')
    // nothing plaintext leaks into the ciphertext columns
    expect(row.path_ct).not.toContain('mi-nota')
    expect(row.content_ct).not.toContain('My note')

    const entry = await decryptFileRow(dek, row)
    expect(entry.relPath).toBe(relPath)
    expect(entry.content).toBe(content)
    expect(entry.deleted).toBe(false)
    expect(entry.updatedAtMs).toBe(Date.parse('2026-07-01T08:30:00.000Z'))
    expect(entry.noteKey).toEqual(noteKey)
  })

  it('rows of the same folder share the note key; a wrong DEK cannot decrypt', async () => {
    const dek = generateDek()
    const noteKey = generateNoteKey()
    const anchor = await buildFileUpsertRow(dek, noteKey, 'dir-a/note.md', 'a', NOW)
    const section = await buildFileUpsertRow(dek, noteKey, 'dir-a/sec001.md', 'b', NOW)
    expect((await decryptFileRow(dek, anchor)).noteKey).toEqual((await decryptFileRow(dek, section)).noteKey)
    await expect(decryptFileRow(generateDek(), anchor)).rejects.toThrow()
  })

  it('tombstone rows blank the content and decrypt to an empty string', async () => {
    const dek = generateDek()
    const row = await buildFileUpsertRow(dek, generateNoteKey(), 'dir-a/sec001.md', 'ignored', NOW, true)
    expect(row.deleted).toBe(true)
    expect(row.content_ct).toBe('')
    const entry = await decryptFileRow(dek, row)
    expect(entry.deleted).toBe(true)
    expect(entry.content).toBe('')
    expect(entry.relPath).toBe('dir-a/sec001.md') // path stays recoverable
  })
})
