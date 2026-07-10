// Shared types for the marketing-site i18n dictionaries.
// `NoteBlock` mirrors the note-body block union used to render each feature as a
// mini NoteFlow note (see Home.astro). The `t` discriminator is kept as a string
// literal union so the renderer can narrow on it.

export type Lang = 'en' | 'es';

export type NoteBlock =
  | { t: 'p'; html: string }
  | { t: 'ul'; items: string[] }
  | { t: 'check'; items: { done: boolean; text: string }[] }
  | { t: 'kbd'; keys: string[] }
  | { t: 'code'; lines: string[] }
  | { t: 'tabs'; tabs: { name: string; tok: string }[] }
  | { t: 'groups'; rows: { name: string; tok: string; count: number }[] };
