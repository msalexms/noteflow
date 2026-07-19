"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEMONSQUEEZY_CHECKOUT_URLS = exports.CLOUD_KEYS_URL = exports.AI_PROXY_URL = exports.SUPABASE_ANON_KEY = exports.SUPABASE_URL = void 0;
exports.isCloudConfigured = isCloudConfigured;
/** Supabase project URL, e.g. 'https://xyzcompany.supabase.co' (no trailing slash). */
exports.SUPABASE_URL = 'https://bolnhekicavuzscdjoty.supabase.co';
/** Supabase anon (public) API key. */
exports.SUPABASE_ANON_KEY = 'sb_publishable_1Ifj7iwZ7w_Xx5B2aLcDfQ_4AbBeFFx';
/** NoteFlow AI managed-LLM proxy (Edge Function ai-proxy, OpenAI-compatible). */
exports.AI_PROXY_URL = `${exports.SUPABASE_URL}/functions/v1/ai-proxy`;
/** NoteFlow Cloud managed-mode key service (Edge Function cloud-keys: setup/unlock). */
exports.CLOUD_KEYS_URL = `${exports.SUPABASE_URL}/functions/v1/cloud-keys`;
/**
 * Lemon Squeezy checkout URLs per product. Filled in once the products exist
 * in the LS store (see supabase/README.md § 6). While a URL is empty, the
 * corresponding "Subscribe" button in Settings stays hidden.
 */
exports.LEMONSQUEEZY_CHECKOUT_URLS = {
    ai: 'https://noteflow-app.lemonsqueezy.com/checkout/buy/67c8e588-e83e-4657-822a-0ecb6a71a980',
    // No NoteFlow Cloud product in the LS store yet — empty hides the button.
    cloud: '',
    // No NoteFlow Bundle (AI + Cloud) product in the LS store yet either.
    bundle: '',
};
/** True once the build carries a real Supabase project configuration. */
function isCloudConfigured() {
    return exports.SUPABASE_URL.length > 0 && exports.SUPABASE_ANON_KEY.length > 0;
}
