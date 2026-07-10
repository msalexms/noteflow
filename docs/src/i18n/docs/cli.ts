// Entry point for the /cli page dictionary (mirrors src/i18n/index.ts).
import { cliEn } from './cli.en';
import { cliEs } from './cli.es';
import type { Lang } from '../types';

export type { CliContent } from './cli.en';

export function getCliContent(lang: Lang) {
  return lang === 'es' ? cliEs : cliEn;
}
