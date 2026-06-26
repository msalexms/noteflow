/** Normalize a string: lowercase + strip diacritical marks (accents) */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildSearchRegex(
  query: string,
  opts: { caseSensitive: boolean } = { caseSensitive: false },
): RegExp | null {
  const trimmed = query.trim()
  if (!trimmed) return null
  const flags = opts.caseSensitive ? 'g' : 'gi'
  try {
    return new RegExp(escapeRegExp(trimmed), flags)
  } catch {
    return null
  }
}

export interface ParsedQuery {
  sectionFilter: string | null
  textQuery: string
}

export function parseSearchQuery(query: string): ParsedQuery {
  const match = query.match(/#(\S+)/)
  if (!match) return { sectionFilter: null, textQuery: query.trim() }
  const sectionFilter = match[1]
  const textQuery = query.replace(/#\S+/, '').trim()
  return { sectionFilter, textQuery }
}

// ── Per-note normalized search index (cached) ────────────────────────────────
// Normalizing a note's full body on every keystroke is O(total text) per character,
// which is the search lag with thousands of notes. We cache the normalized text keyed
// by the note OBJECT in a WeakMap: `updateNote` always produces a fresh note object on
// edit, so the entry is invalidated automatically (and stale ones are GC'd with the
// old object). Building the index for a note only happens once per note version.

export interface NoteSearchIndex {
  title: string
  tags: string[]
  sectionNames: string[]
  sectionContents: string[]
}

interface NoteForSearch {
  title?: string
  tags: string[]
  sections: { name: string; content: string }[]
}

const searchIndexCache = new WeakMap<object, NoteSearchIndex>()

export function getNoteSearchIndex(note: NoteForSearch): NoteSearchIndex {
  const cached = searchIndexCache.get(note as object)
  if (cached) return cached
  const idx: NoteSearchIndex = {
    title: normalize(note.title ?? ''),
    tags: note.tags.map(normalize),
    sectionNames: note.sections.map((s) => normalize(s.name)),
    sectionContents: note.sections.map((s) => normalize(s.content)),
  }
  searchIndexCache.set(note as object, idx)
  return idx
}

/**
 * Whether a note matches a parsed query, using the cached normalized index.
 * Mirrors the sidebar's matching rules: a `#section` filter restricts text matches to
 * the matching sections; otherwise the query matches title / section names / section
 * bodies / tags. An empty text query matches everything.
 */
export function noteMatchesQuery(
  note: NoteForSearch,
  parsed: ParsedQuery,
): boolean {
  const idx = getNoteSearchIndex(note)

  if (parsed.sectionFilter) {
    const sf = normalize(parsed.sectionFilter)
    const matching: number[] = []
    for (let i = 0; i < idx.sectionNames.length; i++) {
      if (idx.sectionNames[i].includes(sf)) matching.push(i)
    }
    if (matching.length === 0) return false
    if (!parsed.textQuery) return true
    const tq = normalize(parsed.textQuery)
    return (
      idx.title.includes(tq) ||
      matching.some((i) => idx.sectionContents[i].includes(tq)) ||
      idx.tags.some((t) => t.includes(tq))
    )
  }

  const q = normalize(parsed.textQuery)
  if (!q) return true
  return (
    idx.title.includes(q) ||
    idx.sectionNames.some((n) => n.includes(q)) ||
    idx.sectionContents.some((c) => c.includes(q)) ||
    idx.tags.some((t) => t.includes(q))
  )
}
