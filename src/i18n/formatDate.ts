import { format } from 'date-fns'
import { useLanguageStore } from '../stores/languageStore'

/**
 * Locale-aware wrapper around date-fns' `format()`. Reads the active date-fns
 * locale from the language store so month/day names follow the UI language.
 *
 * Not a hook — it reads the store imperatively at call time. Components that call
 * it already subscribe to the language (via `useT()`), so they re-render on a
 * language switch and re-run this with the new locale.
 */
export function formatDate(date: Date | number, fmt: string): string {
  const locale = useLanguageStore.getState().dateLocale
  return format(date, fmt, locale ? { locale } : undefined)
}
