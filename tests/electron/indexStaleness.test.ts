// The brain view's "index out of date" dot is only trustworthy if these rules are: an entry may
// only be cleared by an index run that actually covered the content that marked it. See
// electron/ai/indexStaleness.ts for why the timestamps exist.
import { describe, it, expect } from 'vitest'
import { IndexStaleness } from '../../electron/ai/indexStaleness'

describe('IndexStaleness', () => {
  it('reports nothing pending when empty', () => {
    expect(new IndexStaleness().info()).toEqual({ stale: false, count: 0 })
  })

  it('marks a note dir as pending', () => {
    const state = new IndexStaleness()
    expect(state.markDir('note-a', 1_000)).toBe(true)
    expect(state.info()).toEqual({ stale: true, count: 1 })
  })

  it('clears a dir once an index run that started after the mark completes', () => {
    const state = new IndexStaleness()
    state.markDir('note-a', 1_000)
    expect(state.clearDir('note-a', 2_000)).toBe(true)
    expect(state.info()).toEqual({ stale: false, count: 0 })
  })

  it('keeps a dir edited again while it was being indexed', () => {
    const state = new IndexStaleness()
    state.markDir('note-a', 1_000)
    const runStartedAt = 2_000
    state.markDir('note-a', 2_500) // the user edits mid-run
    expect(state.clearDir('note-a', runStartedAt)).toBe(false)
    expect(state.info()).toEqual({ stale: true, count: 1 })
  })

  it('ignores clears for dirs that were never marked', () => {
    const state = new IndexStaleness()
    expect(state.clearDir('note-a', 2_000)).toBe(false)
  })

  it('counts each dir once, no matter how many edits', () => {
    const state = new IndexStaleness()
    state.markDir('note-a', 1_000)
    state.markDir('note-a', 1_500)
    state.markDir('note-b', 1_600)
    expect(state.info()).toEqual({ stale: true, count: 2 })
  })

  it('flags unattributable changes without counting them as dirs', () => {
    const state = new IndexStaleness()
    expect(state.markUnknown(1_000)).toBe(true)
    expect(state.markUnknown(1_500)).toBe(false) // already outstanding
    expect(state.info()).toEqual({ stale: true, count: 0 })
  })

  it('after a full reindex clears what predates it and keeps what came during it', () => {
    const state = new IndexStaleness()
    state.markDir('note-a', 1_000)
    state.markUnknown(1_100)
    const reindexStartedAt = 2_000
    state.markDir('note-b', 2_400) // written while the rebuild was running
    expect(state.clearBefore(reindexStartedAt)).toBe(true)
    expect(state.info()).toEqual({ stale: true, count: 1 })
    expect(state.toJSON()).toEqual({ dirs: { 'note-b': 2_400 } })
  })

  it('reports no change when a reindex covers nothing pending', () => {
    expect(new IndexStaleness().clearBefore(2_000)).toBe(false)
  })

  it('clears everything at once, and says so only when there was something', () => {
    const state = new IndexStaleness()
    state.markDir('note-a', 1_000)
    state.markUnknown(1_000)
    expect(state.clearAll()).toBe(true)
    expect(state.info()).toEqual({ stale: false, count: 0 })
    expect(state.clearAll()).toBe(false)
  })

  it('round-trips through JSON', () => {
    const state = new IndexStaleness()
    state.markDir('note-a', 1_000)
    state.markUnknown(1_200)
    const restored = IndexStaleness.fromJSON(JSON.parse(JSON.stringify(state.toJSON())))
    expect(restored.info()).toEqual({ stale: true, count: 1 })
    expect(restored.clearDir('note-a', 1_500)).toBe(true)
    expect(restored.info()).toEqual({ stale: true, count: 0 }) // the unknown flag survived
  })

  it('omits the unknown flag from the snapshot when there is none', () => {
    const state = new IndexStaleness()
    state.markDir('note-a', 1_000)
    expect(state.toJSON()).toEqual({ dirs: { 'note-a': 1_000 } })
  })

  it('treats a corrupt or foreign snapshot as nothing pending', () => {
    for (const raw of [null, undefined, 42, 'nope', {}, { dirs: null }, { dirs: { a: 'soon' } }, { unknownAt: 'x' }]) {
      expect(IndexStaleness.fromJSON(raw).info()).toEqual({ stale: false, count: 0 })
    }
  })
})
