// Entry point for the /pricing page dictionary (mirrors src/i18n/docs/ai.ts).
import { pricingEn } from './pricing.en';
import { pricingEs } from './pricing.es';
import type { Lang } from '../types';

export type { PricingContent } from './pricing.en';

export function getPricingContent(lang: Lang) {
  return lang === 'es' ? pricingEs : pricingEn;
}
