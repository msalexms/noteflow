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
export const SUPABASE_URL = 'https://bolnhekicavuzscdjoty.supabase.co'

/** Supabase anon (public) API key. */
export const SUPABASE_ANON_KEY = 'sb_publishable_1Ifj7iwZ7w_Xx5B2aLcDfQ_4AbBeFFx'

/** NoteFlow AI managed-LLM proxy (Edge Function ai-proxy, OpenAI-compatible). */
export const AI_PROXY_URL = `${SUPABASE_URL}/functions/v1/ai-proxy`

/**
 * Lemon Squeezy checkout URLs per product. Filled in once the products exist
 * in the LS store (see supabase/README.md § 6). While a URL is empty, the
 * corresponding "Subscribe" button in Settings stays hidden.
 */
export const LEMONSQUEEZY_CHECKOUT_URLS: { ai: string; cloud: string } = {
  ai: 'https://noteflow-app.lemonsqueezy.com/checkout/buy/67c8e588-e83e-4657-822a-0ecb6a71a980',
  // No NoteFlow Cloud product in the LS store yet — empty hides the button.
  cloud: '',
}

/** True once the build carries a real Supabase project configuration. */
export function isCloudConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0
}
