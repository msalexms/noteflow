import { useLanguageStore } from '../stores/languageStore'
import type { Messages } from './index'

/**
 * React hook returning the active message tree. Subscribing to `dict` means any
 * component using `useT()` re-renders when the language changes → live switching
 * with no reload.
 */
export function useT(): Messages {
  return useLanguageStore((s) => s.dict)
}
