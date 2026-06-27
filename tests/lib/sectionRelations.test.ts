import { describe, it, expect } from 'vitest'
import {
  RELATION_SCHEME,
  buildRelationUrl,
  parseRelationUrl,
  extractSectionRelations,
} from '../../src/lib/sectionRelations'

describe('buildRelationUrl / parseRelationUrl', () => {
  it('round-trips a (noteId, sectionId) pair', () => {
    const url = buildRelationUrl('note123', 'secABC')
    expect(url).toBe('noteflow://note123/secABC')
    expect(parseRelationUrl(url)).toEqual({ noteId: 'note123', sectionId: 'secABC' })
  })

  it('uses the RELATION_SCHEME constant as prefix', () => {
    expect(buildRelationUrl('n', 's').startsWith(RELATION_SCHEME)).toBe(true)
  })

  it('rejects URLs without the scheme', () => {
    expect(parseRelationUrl('https://note/sec')).toBeNull()
    expect(parseRelationUrl('note/sec')).toBeNull()
    expect(parseRelationUrl('')).toBeNull()
  })

  it('rejects URLs with no section part (no slash)', () => {
    expect(parseRelationUrl('noteflow://noteOnly')).toBeNull()
  })

  it('rejects URLs with an empty noteId (leading slash)', () => {
    expect(parseRelationUrl('noteflow:///secABC')).toBeNull()
  })

  it('rejects URLs with an empty sectionId (trailing slash)', () => {
    expect(parseRelationUrl('noteflow://noteId/')).toBeNull()
  })

  it('keeps everything after the first slash as the sectionId', () => {
    expect(parseRelationUrl('noteflow://note/sec/with/slashes')).toEqual({
      noteId: 'note',
      sectionId: 'sec/with/slashes',
    })
  })
})

describe('extractSectionRelations', () => {
  it('returns [] for content with no relation links', () => {
    expect(extractSectionRelations('just some text [a link](https://x.com)')).toEqual([])
    expect(extractSectionRelations('')).toEqual([])
  })

  it('extracts multiple distinct relations', () => {
    const content = [
      'See [First](noteflow://n1/s1) and also',
      '[Second](noteflow://n2/s2) for details.',
    ].join('\n')
    expect(extractSectionRelations(content)).toEqual([
      { targetNoteId: 'n1', targetSectionId: 's1' },
      { targetNoteId: 'n2', targetSectionId: 's2' },
    ])
  })

  it('dedupes by (noteId, sectionId)', () => {
    const content =
      '[A](noteflow://n1/s1) then [A again](noteflow://n1/s1) then [B](noteflow://n1/s2)'
    expect(extractSectionRelations(content)).toEqual([
      { targetNoteId: 'n1', targetSectionId: 's1' },
      { targetNoteId: 'n1', targetSectionId: 's2' },
    ])
  })

  it('is stable across repeated calls (global regex lastIndex reset)', () => {
    const content = '[A](noteflow://n1/s1) [B](noteflow://n2/s2)'
    const first = extractSectionRelations(content)
    const second = extractSectionRelations(content)
    expect(first).toEqual(second)
    expect(second).toHaveLength(2)
  })
})
