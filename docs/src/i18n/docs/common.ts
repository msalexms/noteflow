// Entry point for the docs-shell dictionary (mirrors src/i18n/index.ts).
import { commonEn } from './common.en';
import { commonEs } from './common.es';
import type { Lang } from '../types';

export type { DocsCommon } from './common.en';

export function getDocsCommon(lang: Lang) {
  return lang === 'es' ? commonEs : commonEn;
}
