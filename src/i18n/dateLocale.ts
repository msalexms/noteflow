import { es } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import type { Lang } from './types'

// Maps a UI language to the date-fns locale used for month/day names in
// `format()`. English is date-fns' built-in default (enUS), so `undefined`
// means "no locale option" and keeps the default behaviour.
export function getDateLocale(lang: Lang): Locale | undefined {
  return lang === 'es' ? es : undefined
}
