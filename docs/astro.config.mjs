import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

// NoteFlow marketing site. Served from GitHub Pages under a project subpath,
// so `base` must stay in sync with the repo name. When we move to a custom
// domain, set base back to '/' and add a CNAME.
export default defineConfig({
  site: 'https://yagoid.github.io',
  base: '/noteflow',
  trailingSlash: 'ignore',
  // NOTE: the legacy /cli.html → /cli redirect lives in public/cli.html (hand-written
  // meta refresh). Astro's `redirects` option can't be used here: it does not prefix
  // the destination with `base` (it emits url=/cli, a 404 on GitHub Pages) and it
  // generates a cli.html/ *directory* instead of a cli.html file.
  // English is the default locale (no URL prefix, served at /noteflow/); Spanish
  // lives under /noteflow/es/. Manual EN/ES switcher — no browser autodetection.
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    react(),
    // We manage our own design tokens in src/styles, so skip Tailwind's base reset injection.
    tailwind({ applyBaseStyles: false }),
    sitemap({ i18n: { defaultLocale: 'en', locales: { en: 'en', es: 'es' } } }),
  ],
});
