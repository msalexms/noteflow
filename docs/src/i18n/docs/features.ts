// Entry point for the /features page dictionary (mirrors src/i18n/docs/cli.ts).
import { featuresEn } from './features.en';
import { featuresEs } from './features.es';
import type { Lang } from '../types';

export type { FeaturesContent } from './features.en';

export function getFeaturesContent(lang: Lang) {
  return lang === 'es' ? featuresEs : featuresEn;
}
