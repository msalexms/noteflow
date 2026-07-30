/**
 * indexStaleness.ts — pure bookkeeping for "the semantic index is behind the notes".
 *
 * Kept free of electron/fs so the timestamp rules can be unit-tested: aiIndex.ts owns persistence
 * and the event emit, this only answers what is pending and when an entry may be cleared.
 *
 * Why timestamps instead of a plain set: a note can be edited again *while* it is being indexed.
 * Clearing on completion would then drop a note whose newest content never reached the index, so an
 * entry only clears when it was marked strictly before the index run that claims to cover it.
 */

export interface StaleInfo {
  /** True when the index is known to be behind the notes. */
  stale: boolean
  /** How many note dirs are waiting to be (re)indexed (unattributable changes are not counted). */
  count: number
}

/** On-disk shape (userData/ai-index/pending.json). */
export interface StaleSnapshot {
  dirs: Record<string, number>
  unknownAt?: number
}

export class IndexStaleness {
  /** note dir basename → time it was marked. */
  private dirs = new Map<string, number>()
  /** Changes that cannot be pinned to a note dir (pulled deletions, metadata) — only a full reindex clears them. */
  private unknownAt: number | null = null

  /** Tolerant parse: anything unexpected on disk means "nothing pending", never a crash. */
  static fromJSON(raw: unknown): IndexStaleness {
    const state = new IndexStaleness()
    const obj = (raw ?? {}) as Partial<StaleSnapshot>
    for (const [dir, at] of Object.entries(obj.dirs ?? {})) {
      if (typeof at === 'number' && Number.isFinite(at)) state.dirs.set(dir, at)
    }
    if (typeof obj.unknownAt === 'number' && Number.isFinite(obj.unknownAt)) state.unknownAt = obj.unknownAt
    return state
  }

  toJSON(): StaleSnapshot {
    const snapshot: StaleSnapshot = { dirs: Object.fromEntries(this.dirs) }
    if (this.unknownAt !== null) snapshot.unknownAt = this.unknownAt
    return snapshot
  }

  info(): StaleInfo {
    return { stale: this.unknownAt !== null || this.dirs.size > 0, count: this.dirs.size }
  }

  /** Flag a note dir as waiting for the index. Always mutates (the timestamp moves forward). */
  markDir(key: string, at: number): boolean {
    this.dirs.set(key, at)
    return true
  }

  /** Flag an unattributable change. No-op if one is already outstanding. */
  markUnknown(at: number): boolean {
    if (this.unknownAt !== null) return false
    this.unknownAt = at
    return true
  }

  /** Clear one note dir — kept if it was marked again at/after the index run started. */
  clearDir(key: string, since: number): boolean {
    const markedAt = this.dirs.get(key)
    if (markedAt === undefined || markedAt >= since) return false
    this.dirs.delete(key)
    return true
  }

  /** Clear everything marked strictly before `since` — a full reindex covered that snapshot. */
  clearBefore(since: number): boolean {
    let changed = false
    for (const [dir, markedAt] of this.dirs) {
      if (markedAt < since) { this.dirs.delete(dir); changed = true }
    }
    if (this.unknownAt !== null && this.unknownAt < since) { this.unknownAt = null; changed = true }
    return changed
  }

  clearAll(): boolean {
    if (this.dirs.size === 0 && this.unknownAt === null) return false
    this.dirs.clear()
    this.unknownAt = null
    return true
  }
}
