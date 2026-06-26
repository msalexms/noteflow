// ── Section-to-section relations ─────────────────────────────────────────────
//
// A relation is an inline link a user drops into a section's markdown that points
// to another section (in the same note or any other). It is the SINGLE SOURCE OF
// TRUTH: it lives in the section body as `[Name](noteflow://<noteId>/<sectionId>)`,
// so it round-trips through markdown, syncs to GitHub for free, degrades to a
// harmless link in external editors / CLI / mobile, and the brain graph DERIVES
// its edges by scanning section content (works with the AI index disabled).
//
// Kept framework-free so it can be imported from lib/, components/ and the brain
// graph alike.

/** Scheme used for in-app section relations. */
export const RELATION_SCHEME = 'noteflow://'

/** Builds the relation URL stored inside the markdown link. */
export function buildRelationUrl(noteId: string, sectionId: string): string {
  return `${RELATION_SCHEME}${noteId}/${sectionId}`
}

/** Parses a relation URL back into its (noteId, sectionId) pair, or null. */
export function parseRelationUrl(url: string): { noteId: string; sectionId: string } | null {
  if (!url.startsWith(RELATION_SCHEME)) return null
  const rest = url.slice(RELATION_SCHEME.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const noteId = rest.slice(0, slash)
  const sectionId = rest.slice(slash + 1)
  if (!noteId || !sectionId) return null
  return { noteId, sectionId }
}

// Matches a full relation markdown link: `[label](noteflow://noteId/sectionId)`.
// The label is captured but ids are what callers care about. Ids are restricted
// to "not a slash and not a closing paren" so the pattern stays anchored.
export const RELATION_LINK_RE =
  /\[([^\]]+)\]\(noteflow:\/\/([^/)]+)\/([^)]+)\)/g

export interface SectionRelationRef {
  targetNoteId: string
  targetSectionId: string
}

/**
 * Extracts every section relation referenced from a section's markdown content.
 * Deduplicated by (noteId, sectionId). Independent of the AI index.
 */
export function extractSectionRelations(content: string): SectionRelationRef[] {
  if (!content || !content.includes(RELATION_SCHEME)) return []
  const out: SectionRelationRef[] = []
  const seen = new Set<string>()
  // RELATION_LINK_RE is global → reset lastIndex before each scan.
  RELATION_LINK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RELATION_LINK_RE.exec(content)) !== null) {
    const targetNoteId = m[2]
    const targetSectionId = m[3]
    const key = `${targetNoteId}/${targetSectionId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ targetNoteId, targetSectionId })
  }
  return out
}
