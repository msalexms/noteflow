// Data-driven schema for the "second brain" profile wizard. Shown once on first entry to the
// brain view. The goal is LOW friction: the user mostly taps chips / picks one of two / adds tags;
// free text is optional and reserved for questions whose answers are too open to enumerate.
//
// Design note — INDIRECT > DIRECT. Asking someone to introspect and describe their own personality
// is a chore and skews answers. So most of the signal comes from low-effort PROXY questions
// (favourite music/films/books, dream trip) and playful binary "this or that" picks. Those picks
// are deliberately innocuous in the UI but are designed to tap the Big Five (OCEAN) dimensions —
// the only personality framework with strong empirical support. Preference→trait correlations are
// real but MODEST, so the model treats them as soft probabilistic priors, never verdicts. The model
// — not the app — does the inference: it expands, infers and synthesises a Markdown profile note in
// the user's language. The app never processes uploaded documents.
//
// Field ids + types live here; all display strings come from the i18n dict via the factory below.
// Never build the schema at module load — call `getProfileQuestions(t)` at use time so a live
// language switch is reflected (see ProfileFlow's `useMemo([t])`).
import { useLanguageStore } from '../../stores/languageStore'
import type { Messages } from '../../i18n'

export type ProfileFieldType = 'text' | 'chips' | 'tags' | 'choice'

export interface ProfileField {
  id: string
  /** Short label shown above the field AND sent to the model as the answer's key. */
  label: string
  type: ProfileFieldType
  /** Optional helper line under the label. */
  hint?: string
  /** Preset options for `chips`, suggested tags for `tags`, or the mutually-exclusive picks for `choice`. */
  options?: string[]
  placeholder?: string
}

export interface ProfileSection {
  id: string
  /** Section header shown in the UI AND used to group the answers sent to the model. */
  title: string
  /** Optional one-liner under the section header. */
  description?: string
  fields: ProfileField[]
}

/** Builds the profile wizard schema from the active language's message tree. */
export function getProfileQuestions(t: Messages): ProfileSection[] {
  const f = t.aiPanel.profileForm
  return [
    {
      id: 'professional',
      title: f.professional.title,
      description: f.professional.description,
      fields: [
        // Too open to enumerate (any job, studies, life situation) → free text.
        { id: 'about', label: f.professional.about.label, type: 'text', hint: f.professional.about.hint, placeholder: f.professional.about.placeholder },
        { id: 'tools', label: f.professional.tools.label, type: 'tags', hint: f.professional.tools.hint, options: f.professional.tools.options, placeholder: f.professional.tools.placeholder },
        { id: 'goals', label: f.professional.goals.label, type: 'chips', options: f.professional.goals.options },
      ],
    },
    {
      id: 'personal',
      title: f.personal.title,
      description: f.personal.description,
      fields: [
        { id: 'name', label: f.personal.name.label, type: 'text', placeholder: f.personal.name.placeholder },
        { id: 'interests', label: f.personal.interests.label, type: 'tags', options: f.personal.interests.options, placeholder: f.personal.interests.placeholder },
        { id: 'music', label: f.personal.music.label, type: 'tags', hint: f.personal.music.hint, placeholder: f.personal.music.placeholder },
        { id: 'screen', label: f.personal.screen.label, type: 'tags', hint: f.personal.screen.hint, placeholder: f.personal.screen.placeholder },
        { id: 'books', label: f.personal.books.label, type: 'tags', hint: f.personal.books.hint, placeholder: f.personal.books.placeholder },
        { id: 'dreamTrip', label: f.personal.dreamTrip.label, type: 'text', hint: f.personal.dreamTrip.hint, placeholder: f.personal.dreamTrip.placeholder },
      ],
    },
    {
      id: 'style',
      title: f.style.title,
      description: f.style.description,
      fields: [
        { id: 'personality', label: f.style.personality.label, type: 'chips', options: f.style.personality.options },
        { id: 'q_weekend', label: f.style.q_weekend.label, type: 'choice', options: f.style.q_weekend.options },
        { id: 'q_recharge', label: f.style.q_recharge.label, type: 'choice', options: f.style.q_recharge.options },
        { id: 'q_drawn', label: f.style.q_drawn.label, type: 'choice', options: f.style.q_drawn.options },
        { id: 'q_space', label: f.style.q_space.label, type: 'choice', options: f.style.q_space.options },
        { id: 'q_decide', label: f.style.q_decide.label, type: 'choice', options: f.style.q_decide.options },
        { id: 'q_trip', label: f.style.q_trip.label, type: 'choice', options: f.style.q_trip.options },
      ],
    },
    {
      id: 'assistant',
      title: f.assistant.title,
      description: f.assistant.description,
      fields: [
        // The key lever for tuning the assistant's tone.
        { id: 'communication', label: f.assistant.communication.label, type: 'chips', options: f.assistant.communication.options },
        { id: 'extra', label: f.assistant.extra.label, type: 'text', placeholder: f.assistant.extra.placeholder },
      ],
    },
  ]
}

/** Flattened field list — for consumers that iterate fields regardless of section. */
export function getProfileFields(t: Messages): ProfileField[] {
  return getProfileQuestions(t).flatMap((s) => s.fields)
}

/**
 * The language the model should WRITE the profile in. Follows the app's language
 * setting (via the store) rather than the OS/browser locale, so the profile matches
 * the rest of the UI. Returned as an English language name for a clean prompt.
 */
export function detectLocale(): string {
  const lang = useLanguageStore.getState().lang
  return lang === 'es' ? 'Spanish' : 'English'
}
