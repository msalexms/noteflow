// Prompt suggestions shown above the chat composer.
//
// Personalized suggestions are NOT a separate LLM call: the assistant is asked (via
// CHAT_SYSTEM_BASE in electron/main.ts) to end its final answer with a machine-readable
// marker followed by 1-2 next actions. The renderer splits the message on the marker —
// the part before is the visible answer, the part after becomes the suggestion buttons.

/** Literal end-of-answer marker. MUST match the one instructed in CHAT_SYSTEM_BASE. */
export const SUGGESTIONS_MARKER = '<!--SUGGESTIONS-->'

const MAX_SUGGESTIONS = 3

// Strip a partial marker still streaming in at the very end (e.g. "<!--SUGG"), so the raw
// token doesn't flash under the text before the full marker arrives. Only trims suffixes
// that match the marker from its "<!--" opener on, never a lone "<" of legitimate prose.
function stripPartialMarker(s: string): string {
  for (let len = Math.min(s.length, SUGGESTIONS_MARKER.length - 1); len >= 4; len--) {
    if (s.slice(s.length - len) === SUGGESTIONS_MARKER.slice(0, len)) return s.slice(0, s.length - len)
  }
  return s
}

/**
 * Split an assistant message into its visible text and trailing suggestion list.
 * Tolerant of a partial marker mid-stream so the live render stays clean.
 */
export function splitSuggestions(content: string): { visible: string; suggestions: string[] } {
  const idx = content.indexOf(SUGGESTIONS_MARKER)
  if (idx === -1) {
    return { visible: stripPartialMarker(content), suggestions: [] }
  }
  const visible = content.slice(0, idx).trimEnd()
  const suggestions = content
    .slice(idx + SUGGESTIONS_MARKER.length)
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*]\s+)?/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_SUGGESTIONS)
  return { visible, suggestions }
}

// ── Personalized starters ──────────────────────────────────────────────────────
// When the chat is empty we build randomized starter chips from the user's own note
// and section names (e.g. "Reorganize \"Project ideas\"") so the empty state feels
// alive and varies each time the view is opened. Falls back to the generic starters.
//
// Label templates are passed in (from the i18n dict, see `t.aiPanel.chat.suggestions`)
// rather than hard-coded, so they follow the UI language. `note`/`section` templates
// interpolate the quoted name via a `{name}` placeholder.

type StarterNote = {
  title: string
  sections: { name: string; aiHidden?: boolean }[]
  encryption?: unknown
  archived?: boolean
  expiresAt?: string
}

/** Suggestion label templates sourced from the active language. */
export interface SuggestionLabels {
  generic: string[]
  note: string[]
  section: string[]
}

// Quote a name for a chip, trimming over-long titles so the button stays compact.
function quoteName(name: string): string {
  const t = name.trim()
  const short = t.length > 28 ? `${t.slice(0, 27)}…` : t
  return `“${short}”`
}

function fill(template: string, name: string): string {
  return template.replace(/\{name\}/g, quoteName(name))
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Build randomized starter suggestions personalized with the user's own note and
 * section names. Meant to be recomputed each time the empty chat is shown so the
 * chips vary. Falls back to the generic starters when there are no usable notes.
 */
export function buildStarterSuggestions(
  notes: StarterNote[],
  labels: SuggestionLabels,
  count = MAX_SUGGESTIONS,
): string[] {
  // Only notes the AI can actually act on: skip encrypted (unreadable), archived and
  // temporary notes, plus untitled ones.
  const usable = notes.filter(
    (n) => !n.encryption && !n.archived && !n.expiresAt && n.title.trim().length > 0,
  )
  if (usable.length === 0) return shuffle(labels.generic).slice(0, count)

  const out: string[] = []
  const seen = new Set<string>()
  const push = (s: string) => {
    if (s && !seen.has(s)) { seen.add(s); out.push(s) }
  }

  const notePool = shuffle(usable)
  // Section names the AI can see (aiHidden sections are off-limits everywhere).
  const sectionNames = shuffle(
    usable
      .flatMap((n) => n.sections)
      .filter((s) => !s.aiHidden && s.name.trim().length > 0)
      .map((s) => s.name),
  )

  let ni = 0
  let si = 0
  // Mix in a section-based chip roughly 1 in 3; the rest use note titles.
  while (out.length < count && (ni < notePool.length || si < sectionNames.length)) {
    const useSection =
      si < sectionNames.length && (ni >= notePool.length || Math.random() < 0.34)
    if (useSection) {
      push(fill(pick(labels.section), sectionNames[si++]))
    } else if (ni < notePool.length) {
      push(fill(pick(labels.note), notePool[ni++].title))
    } else {
      break
    }
  }

  // Top up with generic starters if we produced too few (e.g. dedupe collisions).
  for (const g of shuffle(labels.generic)) {
    if (out.length >= count) break
    push(g)
  }
  return out.slice(0, count)
}
