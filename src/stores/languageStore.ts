import { create } from 'zustand'
import type { Locale } from 'date-fns'
import { getMessages, resolveLang, en, type Lang, type LanguageSetting, type Messages } from '../i18n'
import { getDateLocale } from '../i18n/dateLocale'

interface LanguageState {
  /** The persisted user choice: 'system' | 'en' | 'es'. */
  setting: LanguageSetting
  /** The resolved language actually in use. */
  lang: Lang
  /** Active message tree — components subscribe to this for live switching. */
  dict: Messages
  /** date-fns locale for the active language (undefined = English default). */
  dateLocale: Locale | undefined
  initLanguage: () => void
  setLanguage: (setting: LanguageSetting) => void
}

// Applies a setting to the store state (resolve + pick dict + date locale). Shared
// by init and the broadcast handler so there is a single update path.
function apply(
  setting: LanguageSetting,
): { setting: LanguageSetting; lang: Lang; dict: Messages; dateLocale: Locale | undefined } {
  const lang = resolveLang(setting)
  return { setting, lang, dict: getMessages(lang), dateLocale: getDateLocale(lang) }
}

export const useLanguageStore = create<LanguageState>((set) => ({
  setting: 'system',
  lang: 'en',
  dict: en,
  dateLocale: undefined,

  initLanguage: () => {
    const setting = (window.noteflow.getLanguage() ?? 'system') as LanguageSetting
    set(apply(setting))
    // The main process broadcasts `language-changed` after persisting (including
    // to this very window), so this store — and every other window, e.g. open
    // stickies — updates through one route.
    window.noteflow.onLanguageChanged((next) => set(apply(next)))
  },

  setLanguage: (setting) => {
    // Persist + broadcast in main; the broadcast round-trips back here and does
    // the actual state update, so we don't set() locally to avoid a double path.
    window.noteflow.setLanguage(setting)
  },
}))
