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

export const PROFILE_SECTIONS: ProfileSection[] = [
  {
    id: 'professional',
    title: 'Professional',
    description: 'Work, studies and what you spend your focus on.',
    fields: [
      {
        // Too open to enumerate (any job, studies, life situation) → free text.
        id: 'about',
        label: 'What do you do?',
        type: 'text',
        hint: 'Work, studies, or how you spend most of your time. A line is enough.',
        placeholder: 'e.g. I study architecture / I run a small bakery / Backend dev at a startup',
      },
      {
        id: 'tools',
        label: 'Tools & apps you use often',
        type: 'tags',
        hint: 'Optional — anything from Notion to a programming language.',
        options: ['Notion', 'Excel', 'Figma', 'Obsidian', 'Photoshop', 'VS Code', 'Python', 'TypeScript'],
        placeholder: 'Type a tool and press Enter',
      },
      {
        id: 'goals',
        label: "What are you focused on?",
        type: 'chips',
        options: ['Learn something new', 'Build a habit', 'Get organized', 'Ship a project', 'Find a job', 'Improve my health', 'Personal growth', 'Earn more'],
      },
    ],
  },
  {
    id: 'personal',
    title: 'Personal',
    description: "A few favourites — no need to overthink, just what comes to mind.",
    fields: [
      {
        id: 'name',
        label: 'Your name',
        type: 'text',
        placeholder: 'Optional — how should the AI address you?',
      },
      {
        id: 'interests',
        label: 'Interests & passions',
        type: 'tags',
        options: ['Reading', 'Music', 'Gaming', 'Sports', 'Cooking', 'Travel', 'Art', 'Science', 'Technology', 'Photography', 'Writing', 'Nature'],
        placeholder: 'Type anything you love and press Enter',
      },
      {
        id: 'music',
        label: 'Songs or artists you keep coming back to',
        type: 'tags',
        hint: 'A few is plenty — taste says more than you’d think.',
        placeholder: 'Type a song or artist and press Enter',
      },
      {
        id: 'screen',
        label: 'Favourite films or series',
        type: 'tags',
        hint: 'The ones you’d rewatch any day.',
        placeholder: 'Type a film or series and press Enter',
      },
      {
        id: 'books',
        label: 'Books that stuck with you',
        type: 'tags',
        hint: 'Optional.',
        placeholder: 'Type a book and press Enter',
      },
      {
        id: 'dreamTrip',
        label: 'A place you’d love to go',
        type: 'text',
        hint: 'Optional — a dream trip or a spot you keep thinking about.',
        placeholder: 'e.g. road-tripping Iceland / a quiet cabin in the mountains',
      },
    ],
  },
  {
    id: 'style',
    title: 'Your style',
    description: 'Quick taps — there are no right answers, just go with your gut.',
    fields: [
      {
        id: 'personality',
        label: 'How would you describe yourself?',
        type: 'chips',
        options: ['Curious', 'Analytical', 'Creative', 'Organized', 'Spontaneous', 'Introverted', 'Extroverted', 'Detail-oriented', 'Big-picture', 'Pragmatic', 'Ambitious', 'Easy-going'],
      },
      {
        id: 'q_weekend',
        label: 'Your ideal weekend is…',
        type: 'choice',
        options: ['Planned in advance', 'Decided in the moment'],
      },
      {
        id: 'q_recharge',
        label: 'You recharge by…',
        type: 'choice',
        options: ['Time on your own', 'Being around people'],
      },
      {
        id: 'q_drawn',
        label: 'You’re more drawn to…',
        type: 'choice',
        options: ['A bold new idea', 'A proven, reliable method'],
      },
      {
        id: 'q_space',
        label: 'Your space tends to be…',
        type: 'choice',
        options: ['Minimal and tidy', 'Full of things you love'],
      },
      {
        id: 'q_decide',
        label: 'When you decide, you trust…',
        type: 'choice',
        options: ['The logic and facts', 'Your gut and the people involved'],
      },
      {
        id: 'q_trip',
        label: 'A trip you’d choose…',
        type: 'choice',
        options: ['A packed itinerary', 'Wandering with no plan'],
      },
    ],
  },
  {
    id: 'assistant',
    title: 'Working with the AI',
    description: 'How you’d like the assistant to show up for you.',
    fields: [
      {
        // The key lever for tuning the assistant's tone.
        id: 'communication',
        label: 'How should the AI talk to you?',
        type: 'chips',
        options: ['Concise & direct', 'Detailed & thorough', 'Casual & friendly', 'Formal', 'Encouraging', 'Challenge my ideas', 'Step by step', 'Use examples'],
      },
      {
        id: 'extra',
        label: 'Anything else',
        type: 'text',
        placeholder: 'Optional — anything else that would help the AI understand you',
      },
    ],
  },
]

/** Flattened field list — for consumers that iterate fields regardless of section. */
export const PROFILE_FIELDS: ProfileField[] = PROFILE_SECTIONS.flatMap((s) => s.fields)

export function detectLocale(): string {
  return (typeof navigator !== 'undefined' && navigator.language) || 'en'
}
