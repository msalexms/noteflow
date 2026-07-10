// Entry point for the /ai page dictionary (mirrors src/i18n/docs/cli.ts).
import { aiEn } from './ai.en';
import { aiEs } from './ai.es';
import type { Lang } from '../types';

export type { AiContent } from './ai.en';

export function getAiContent(lang: Lang) {
  return lang === 'es' ? aiEs : aiEn;
}
