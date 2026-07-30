"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndexStaleness = void 0;
class IndexStaleness {
    constructor() {
        /** note dir basename → time it was marked. */
        this.dirs = new Map();
        /** Changes that cannot be pinned to a note dir (pulled deletions, metadata) — only a full reindex clears them. */
        this.unknownAt = null;
    }
    /** Tolerant parse: anything unexpected on disk means "nothing pending", never a crash. */
    static fromJSON(raw) {
        const state = new IndexStaleness();
        const obj = (raw ?? {});
        for (const [dir, at] of Object.entries(obj.dirs ?? {})) {
            if (typeof at === 'number' && Number.isFinite(at))
                state.dirs.set(dir, at);
        }
        if (typeof obj.unknownAt === 'number' && Number.isFinite(obj.unknownAt))
            state.unknownAt = obj.unknownAt;
        return state;
    }
    toJSON() {
        const snapshot = { dirs: Object.fromEntries(this.dirs) };
        if (this.unknownAt !== null)
            snapshot.unknownAt = this.unknownAt;
        return snapshot;
    }
    info() {
        return { stale: this.unknownAt !== null || this.dirs.size > 0, count: this.dirs.size };
    }
    /** Flag a note dir as waiting for the index. Always mutates (the timestamp moves forward). */
    markDir(key, at) {
        this.dirs.set(key, at);
        return true;
    }
    /** Flag an unattributable change. No-op if one is already outstanding. */
    markUnknown(at) {
        if (this.unknownAt !== null)
            return false;
        this.unknownAt = at;
        return true;
    }
    /** Clear one note dir — kept if it was marked again at/after the index run started. */
    clearDir(key, since) {
        const markedAt = this.dirs.get(key);
        if (markedAt === undefined || markedAt >= since)
            return false;
        this.dirs.delete(key);
        return true;
    }
    /** Clear everything marked strictly before `since` — a full reindex covered that snapshot. */
    clearBefore(since) {
        let changed = false;
        for (const [dir, markedAt] of this.dirs) {
            if (markedAt < since) {
                this.dirs.delete(dir);
                changed = true;
            }
        }
        if (this.unknownAt !== null && this.unknownAt < since) {
            this.unknownAt = null;
            changed = true;
        }
        return changed;
    }
    clearAll() {
        if (this.dirs.size === 0 && this.unknownAt === null)
            return false;
        this.dirs.clear();
        this.unknownAt = null;
        return true;
    }
}
exports.IndexStaleness = IndexStaleness;
