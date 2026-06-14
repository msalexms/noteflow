// Fixed onboarding questions for the "second brain" profile. Shown once on first entry to the
// brain view. The answers are sent to the LLM, which synthesises a Markdown profile note in the
// same language the user answered in (locale is detected and passed through). Adaptive
// (LLM-driven) questioning is a later milestone.

export interface ProfileQuestion {
  id: string
  question: string
}

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  { id: 'about', question: 'Who are you? (name, what you do, your role)' },
  { id: 'work', question: 'What are you working on right now? (projects, main topics)' },
  { id: 'interests', question: 'What are your areas of interest or expertise?' },
  { id: 'goals', question: 'What are your short- and mid-term goals?' },
  { id: 'tools', question: 'Which tools, languages or technologies do you use often?' },
  { id: 'extra', question: 'Anything else the AI should know to help you better?' },
]

export function detectLocale(): string {
  return (typeof navigator !== 'undefined' && navigator.language) || 'en'
}
