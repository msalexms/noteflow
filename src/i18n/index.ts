import { en, type Messages } from './en'
import { es } from './es'
import type { Lang, LanguageSetting } from './types'

export type { Lang, LanguageSetting } from './types'
export type { Messages } from './en'
// `en` is re-exported as the reference message tree (used as the default dict
// before the store initialises).
export { en }
export { tf, plural } from './format'

/** Returns the message tree for a resolved language. */
export function getMessages(lang: Lang): Messages {
  return lang === 'es' ? es : en
}

/**
 * Resolves a user setting to a concrete language. For 'system' we read the
 * browser locale (Electron mirrors the OS locale into `navigator.language`) and
 * fall back to English for anything that is not Spanish.
 */
export function resolveLang(setting: LanguageSetting): Lang {
  if (setting === 'en' || setting === 'es') return setting
  const locale = typeof navigator !== 'undefined' ? navigator.language : ''
  return locale?.toLowerCase().startsWith('es') ? 'es' : 'en'
}
