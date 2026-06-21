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

/** Static starters shown when the chat is empty (UI text is English). */
export const GENERIC_SUGGESTIONS: string[] = [
  'Summarize my recent notes',
  'What have I been working on lately?',
  'Find notes about a topic',
]
