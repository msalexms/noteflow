// Pure logic for NoteFlow Cloud sync (phase 4.2, stage 2): row↔file mapping,
// timestamp resolution, conflict decisions and the encrypt/decrypt bridge
// between notes-dir-relative files and rows of public.files (migration 0004).
// Lives in electron/ but imports nothing from Electron — cloudSync.ts injects
// all IO — following the same pure-module pattern as syncState.ts /
// entitlements.ts. Covered by tests/electron/cloudSync.test.ts.
//
// Model recap (see .claude/context/monetization.md § 4): one row per file,
// keyed by an opaque deterministic path_key; every column *_ct is a sealed
// AES-256-GCM blob (cloudCrypto.ts); updated_at is plaintext ON PURPOSE — it is
// the basis of conflict resolution (note folder = unit of conflict, same rule
// as the GitHub Sync pull) and of the incremental pull.

import { NOTE_MD } from './noteFormat'
import {
  derivePathKeyHmac,
  wrapKey,
  unwrapKey,
  encryptContent,
  decryptContent,
} from './cloudCrypto'

// Root-level JSON files that sync alongside the note folders.
// ⚠️ Keep in sync with METADATA_FILENAMES in githubSync.ts (private there).
export const CLOUD_METADATA_FILENAMES = [
  'groups.json',
  'folders.json',
  'section-colors.json',
  'note-order.json',
  'templates.json',
] as const

// ── Row shapes ────────────────────────────────────────────────────────────────

/** Wire shape of a public.files row (user_id added by the engine on insert). */
export interface CloudFileRow {
  path_key: string
  path_ct: string
  content_ct: string
  key_ct: string
  updated_at: string
  deleted: boolean
}

/** A decrypted row, ready to be applied to disk. */
export interface CloudPullEntry {
  relPath: string
  /** Empty string for tombstones (their content_ct is blanked server-side). */
  content: string
  /** Unwrapped per-note key of the row (lets the engine seed its key cache). */
  noteKey: Uint8Array
  updatedAt: string
  updatedAtMs: number
  deleted: boolean
}

// ── Path mapping ──────────────────────────────────────────────────────────────

/**
 * Note directory of a notes-dir-relative path ('<dir>/<file>.md' → '<dir>'),
 * or null for root-level files (metadata json). The dir is the unit of both
 * the shared per-note key and conflict resolution.
 */
export function noteDirOf(relPath: string): string | null {
  const i = relPath.indexOf('/')
  return i > 0 ? relPath.slice(0, i) : null
}

/** True for '<dir>/note.md' — the anchor whose `updated:` decides conflicts. */
export function isAnchorPath(relPath: string): boolean {
  const dir = noteDirOf(relPath)
  return dir !== null && relPath === `${dir}/${NOTE_MD}`
}

/**
 * Whether a DECRYPTED relPath is safe to write inside the notes dir. Pulled
 * paths come from server-stored ciphertext — a compromised server can't forge
 * them (GCM would fail without the DEK), but defense in depth costs nothing:
 * only '<dir>/<file>.md' (one level deep) or a known root metadata json,
 * never traversal segments or separators that escape the notes dir.
 */
export function isSafeCloudRelPath(relPath: string): boolean {
  if (!relPath || relPath.includes('\\') || relPath.startsWith('/')) return false
  const parts = relPath.split('/')
  if (parts.some((p) => !p || p === '.' || p === '..')) return false
  if (parts.length === 1) return (CLOUD_METADATA_FILENAMES as readonly string[]).includes(relPath)
  return parts.length === 2 && parts[1].endsWith('.md')
}

// ── Timestamps ────────────────────────────────────────────────────────────────

// Same regex-based extraction as githubSync.ts (private there): the `updated:`
// value of the note.md frontmatter, without a full YAML parse.
export function extractUpdatedTimestamp(content: string): string | null {
  const match = content.match(/^updated:\s*['"]?([^'"\n]+)['"]?\s*$/m)
  return match ? match[1].trim() : null
}

export function parseUpdatedTimestamp(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * updated_at of a pushed row. Decision (documented in monetization.md § 4):
 *   - '<dir>/note.md'   → its own frontmatter `updated:`;
 *   - '<dir>/<sec>.md'  → the ANCHOR's `updated:` (anchorContent read from disk
 *     by the engine) — sections carry no own timestamp, and inheriting the
 *     anchor's guarantees a note edit lands as one coherent group in the
 *     incremental pull window of other devices;
 *   - root metadata json → nowIso (write time — these files have no frontmatter);
 *   - fallback nowIso when the frontmatter is missing or unparseable.
 * Always normalized to ISO so Postgres timestamptz comparisons are exact.
 */
export function resolveRowUpdatedAt(
  relPath: string,
  content: string,
  anchorContent: string | null,
  nowIso: string
): string {
  const dir = noteDirOf(relPath)
  if (dir === null) return nowIso
  const source = isAnchorPath(relPath) ? content : anchorContent
  const ms = parseUpdatedTimestamp(extractUpdatedTimestamp(source ?? ''))
  return ms === null ? nowIso : new Date(ms).toISOString()
}

// ── Conflict decisions (mirror of the GitHub Sync pull rules) ─────────────────

/**
 * Should the pull write a remote note dir over the local one? Newer remote
 * anchor wins WHOLESALE; missing local = fresh note from another device.
 * Unparseable remote timestamp → never apply (can't reason about it).
 */
export function shouldApplyRemoteDir(
  remoteUpdatedMs: number | null,
  localUpdatedMs: number | null
): boolean {
  if (remoteUpdatedMs === null) return false
  if (localUpdatedMs === null) return true
  return remoteUpdatedMs > localUpdatedMs
}

/**
 * Should a remote tombstone delete the local copy? Safety rule shared with the
 * GitHub pull: only when the local `updated` is <= lastSync — i.e. the remote
 * knew this state and deleted it since. Newer local edits win (they'll be
 * re-pushed); no lastSync (first reconcile) or unknown age → never delete.
 */
export function shouldApplyRemoteDeletion(
  localUpdatedMs: number | null,
  lastSyncMs: number | null
): boolean {
  if (lastSyncMs === null) return false
  if (localUpdatedMs === null) return false
  return localUpdatedMs <= lastSyncMs
}

// ── Pull grouping / cursor ────────────────────────────────────────────────────

/** Splits decrypted pull entries into note-dir groups + root-level files. */
export function groupEntriesByDir<T extends { relPath: string }>(
  entries: T[]
): { dirs: Map<string, T[]>; rootFiles: T[] } {
  const dirs = new Map<string, T[]>()
  const rootFiles: T[] = []
  for (const e of entries) {
    const dir = noteDirOf(e.relPath)
    if (dir === null) {
      rootFiles.push(e)
      continue
    }
    let group = dirs.get(dir)
    if (!group) {
      group = []
      dirs.set(dir, group)
    }
    group.push(e)
  }
  return { dirs, rootFiles }
}

/**
 * Advances the incremental-pull cursor to the max updated_at reconciled. The
 * cursor is the WATERMARK of remote rows already seen (`updated_at=gt.cursor`),
 * deliberately separate from lastSync (wall clock, deletion-safety rule): rows
 * are timestamped by clients from note frontmatter, so "now" on this device
 * would skip rows another device pushed with slightly older timestamps.
 */
export function nextPullCursor(
  current: string | undefined,
  entries: Array<{ updatedAt: string }>
): string | undefined {
  let maxMs = current ? Date.parse(current) : null
  let maxIso = current
  for (const e of entries) {
    const ms = Date.parse(e.updatedAt)
    if (!Number.isFinite(ms)) continue
    if (maxMs === null || ms > maxMs) {
      maxMs = ms
      maxIso = new Date(ms).toISOString()
    }
  }
  return maxIso
}

// ── Row crypto (cloudCrypto only — no IO) ─────────────────────────────────────

/**
 * Builds the encrypted upsert row for a file. All rows of the same note folder
 * must be built with the SAME noteKey (the engine caches one key per dir);
 * root metadata files get their own per-file key.
 */
export async function buildFileUpsertRow(
  dek: Uint8Array,
  noteKey: Uint8Array,
  relPath: string,
  content: string,
  updatedAt: string,
  deleted = false
): Promise<CloudFileRow> {
  return {
    path_key: await derivePathKeyHmac(dek, relPath),
    path_ct: await encryptContent(noteKey, relPath),
    content_ct: deleted ? '' : await encryptContent(noteKey, content),
    key_ct: await wrapKey(noteKey, dek),
    updated_at: updatedAt,
    deleted,
  }
}

/**
 * Decrypts a pulled row back to a relPath + content. Throws on a wrong DEK or
 * tampered blobs (GCM auth). Tombstones (deleted, blank content_ct) decrypt to
 * an empty content — their path_ct/key_ct stay intact server-side.
 */
export async function decryptFileRow(dek: Uint8Array, row: CloudFileRow): Promise<CloudPullEntry> {
  const noteKey = await unwrapKey(row.key_ct, dek)
  const relPath = await decryptContent(noteKey, row.path_ct)
  const content = row.deleted || !row.content_ct ? '' : await decryptContent(noteKey, row.content_ct)
  const updatedAtMs = Date.parse(row.updated_at)
  return {
    relPath,
    content,
    noteKey,
    updatedAt: row.updated_at,
    updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
    deleted: row.deleted,
  }
}
