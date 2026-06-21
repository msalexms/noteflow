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
  integrations: [
    react(),
    // We manage our own design tokens in src/styles, so skip Tailwind's base reset injection.
    tailwind({ applyBaseStyles: false }),
    sitemap(),
  ],
});
