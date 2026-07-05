// NoteFlow account backend (Supabase) — connection constants.
//
// These are filled in when the real Supabase project is created (see
// supabase/README.md for the operator steps). While empty, every account
// feature is inert: getAccountStatus() reports configured === false and the
// Settings → Account panel shows an informative placeholder.
//
// The anon key is PUBLIC by design (same model as the GitHub OAuth client ID
// embedded for the sync Device Flow): it grants nothing by itself — security
// comes from Row Level Security policies and per-user Auth JWTs.

/** Supabase project URL, e.g. 'https://xyzcompany.supabase.co' (no trailing slash). */
export const SUPABASE_URL = ''

/** Supabase anon (public) API key. */
export const SUPABASE_ANON_KEY = ''

/** True once the build carries a real Supabase project configuration. */
export function isCloudConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0
}
