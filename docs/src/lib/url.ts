// Prefix internal links with Astro's configured base ('/noteflow/').
// Use for every internal href so links keep working under the project subpath.
const BASE = import.meta.env.BASE_URL;

export function href(path: string): string {
  const base = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

// For assets in public/ (e.g. asset('/screenshots/x.png')).
export const asset = href;
