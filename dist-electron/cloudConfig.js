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
exports.SUPABASE_ANON_KEY = exports.SUPABASE_URL = void 0;
exports.isCloudConfigured = isCloudConfigured;
/** Supabase project URL, e.g. 'https://xyzcompany.supabase.co' (no trailing slash). */
exports.SUPABASE_URL = 'https://bolnhekicavuzscdjoty.supabase.co';
/** Supabase anon (public) API key. */
exports.SUPABASE_ANON_KEY = 'sb_publishable_1Ifj7iwZ7w_Xx5B2aLcDfQ_4AbBeFFx';
/** True once the build carries a real Supabase project configuration. */
function isCloudConfigured() {
    return exports.SUPABASE_URL.length > 0 && exports.SUPABASE_ANON_KEY.length > 0;
}
