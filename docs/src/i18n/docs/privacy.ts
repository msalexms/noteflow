// Entry point for the /privacy page dictionary (mirrors src/i18n/docs/pricing.ts).
import { privacyEn } from './privacy.en';
import { privacyEs } from './privacy.es';
import type { Lang } from '../types';
import type { LegalContent } from './legal';

export function getPrivacyContent(lang: Lang): LegalContent {
  return lang === 'es' ? privacyEs : privacyEn;
}
