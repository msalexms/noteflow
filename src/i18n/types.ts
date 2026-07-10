// Supported UI languages. English is the source of truth for the message tree;
// every other language is forced by TypeScript to mirror its shape (see es/index.ts).
export type Lang = 'en' | 'es'

// The persisted user setting: an explicit language, or 'system' to follow the OS.
export type LanguageSetting = Lang | 'system'
