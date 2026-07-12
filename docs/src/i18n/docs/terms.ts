// Entry point for the /terms page dictionary (mirrors src/i18n/docs/pricing.ts).
import { termsEn } from './terms.en';
import { termsEs } from './terms.es';
import type { Lang } from '../types';
import type { LegalContent } from './legal';

export function getTermsContent(lang: Lang): LegalContent {
  return lang === 'es' ? termsEs : termsEn;
}
