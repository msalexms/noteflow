// Cookie-consent banner copy. Base.astro is shared by the landing and every docs/legal
// page, so its banner strings live here (not in the landing or docs dictionaries).
// English is the source of the shape; Spanish must satisfy the same `Consent` type.
import type { Lang } from './types';

export const consent = {
  en: {
    title: 'Cookies',
    message:
      'We use analytics cookies (Google Analytics) to understand how the site is used. Nothing loads until you accept.',
    accept: 'Accept',
    reject: 'Reject',
    policy: 'Cookie policy',
    aria: 'Cookie consent',
  },
  es: {
    title: 'Cookies',
    message:
      'Usamos cookies de analítica (Google Analytics) para entender cómo se usa el sitio. No se carga nada hasta que aceptes.',
    accept: 'Aceptar',
    reject: 'Rechazar',
    policy: 'Política de cookies',
    aria: 'Consentimiento de cookies',
  },
};

export type Consent = (typeof consent)['en'];

export function getConsent(lang: Lang): Consent {
  return consent[lang];
}
