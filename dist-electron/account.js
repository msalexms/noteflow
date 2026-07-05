"use strict";
// NoteFlow account (Supabase Auth + entitlements) — main-process session layer.
//
// Structural mirror of githubSync.ts: settings persisted under a section of
// settings.json with the secret encrypted via safeStorage (base64 fallback),
// module-level state, a public status object for the renderer, and an
// onStatusChanged callback that main.ts wires to a broadcast.
//
// Auth is Supabase GoTrue over plain REST (no @supabase/supabase-js dep):
//   POST /auth/v1/otp                          → email a 6-digit code
//   POST /auth/v1/verify                       → code → session (access+refresh)
//   POST /auth/v1/token?grant_type=refresh_token → rotate session
//   POST /auth/v1/logout                       → revoke (best-effort)
// Entitlements come from PostgREST: GET /rest/v1/subscriptions (RLS-scoped).
//
// Security model: the refresh token is encrypted at rest and NEVER crosses to
// the renderer; the access token lives only in main-process memory. The
// renderer sees exclusively the public status {configured, signedIn, email,
// entitlements, entitlementsFetchedAt}.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAccountSettings = loadAccountSettings;
exports.onStatusChanged = onStatusChanged;
exports.getAccountStatus = getAccountStatus;
exports.requestOtp = requestOtp;
exports.verifyOtp = verifyOtp;
exports.getAccessToken = getAccessToken;
exports.signOut = signOut;
exports.refreshEntitlements = refreshEntitlements;
exports.initAccount = initAccount;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const secret_1 = require("./ai/llm/secret");
const cloudConfig_1 = require("./cloudConfig");
const entitlements_1 = require("./entitlements");
// ── Settings helpers (same idiom as githubSync) ───────────────────────────────
function getSettingsPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'settings.json');
}
function readSettings() {
    try {
        return JSON.parse(fs_1.default.readFileSync(getSettingsPath(), 'utf-8'));
    }
    catch {
        return {};
    }
}
function writeSettings(data) {
    fs_1.default.writeFileSync(getSettingsPath(), JSON.stringify(data), 'utf-8');
}
// ── Module state ──────────────────────────────────────────────────────────────
let accountSettings = null;
// Access token lives ONLY in memory (GoTrue access tokens expire in ~1h; the
// persisted refresh token mints new ones on demand).
let accessToken = null;
let accessTokenExpiresAtMs = 0;
let entitlements = entitlements_1.NO_ENTITLEMENTS;
let entitlementsFetchedAt;
let statusListener = null;
// Single-flight guard: GoTrue ROTATES the refresh token on every use, so two
// concurrent refreshes would race — the loser would persist an already-consumed
// token and sign the user out.
let refreshInFlight = null;
const NOT_CONFIGURED_ERROR = 'NoteFlow account services are not available in this build.';
const NETWORK_ERROR = 'Could not reach the NoteFlow account service. Check your connection and try again.';
/** JSON request against the Supabase project. Throws only on network/timeout errors. */
async function supabaseRequest(endpoint, opts = {}) {
    const res = await fetch(`${cloudConfig_1.SUPABASE_URL}${endpoint}`, {
        method: opts.method ?? 'GET',
        headers: {
            apikey: cloudConfig_1.SUPABASE_ANON_KEY,
            ...(opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {}),
            ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(15000),
    });
    let json = null;
    try {
        json = await res.json();
    }
    catch {
        // 204 / empty body — fine
    }
    return { status: res.status, json };
}
/** Extracts a human-readable message from a GoTrue/PostgREST error payload. */
function extractErrorMessage(json, fallback) {
    if (json && typeof json === 'object') {
        const o = json;
        for (const key of ['msg', 'message', 'error_description', 'error']) {
            if (typeof o[key] === 'string' && o[key])
                return o[key];
        }
    }
    return fallback;
}
// ── Session persistence ───────────────────────────────────────────────────────
function loadAccountSettings() {
    const settings = readSettings();
    accountSettings = settings.account ?? {};
    return accountSettings;
}
function persistAccountSettings(next) {
    accountSettings = next;
    const settings = readSettings();
    settings.account = next;
    writeSettings(settings);
}
function clearSession() {
    accountSettings = {};
    accessToken = null;
    accessTokenExpiresAtMs = 0;
    entitlements = entitlements_1.NO_ENTITLEMENTS;
    entitlementsFetchedAt = undefined;
    const settings = readSettings();
    delete settings.account;
    writeSettings(settings);
}
function notifyStatusChanged() {
    statusListener?.();
}
// ── Public API ────────────────────────────────────────────────────────────────
function onStatusChanged(cb) {
    statusListener = cb;
}
function getAccountStatus() {
    const s = accountSettings ?? loadAccountSettings();
    const configured = (0, cloudConfig_1.isCloudConfigured)();
    const signedIn = configured && !!(s.encryptedRefreshToken && s.userId);
    return {
        configured,
        signedIn,
        email: signedIn ? s.email : undefined,
        entitlements: signedIn ? entitlements : entitlements_1.NO_ENTITLEMENTS,
        entitlementsFetchedAt: signedIn ? entitlementsFetchedAt : undefined,
    };
}
/** Emails a 6-digit one-time code (creates the account on first sign-in). */
async function requestOtp(email) {
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return { ok: false, error: NOT_CONFIGURED_ERROR };
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@'))
        return { ok: false, error: 'Please enter a valid email address.' };
    try {
        const res = await supabaseRequest('/auth/v1/otp', {
            method: 'POST',
            body: { email: trimmed, create_user: true },
        });
        if (res.status >= 400) {
            if (res.status === 429)
                return { ok: false, error: 'Too many attempts. Please wait a moment and try again.' };
            return { ok: false, error: extractErrorMessage(res.json, 'Could not send the sign-in code.') };
        }
        return { ok: true };
    }
    catch (err) {
        console.error('[Account] requestOtp failed:', String(err));
        return { ok: false, error: NETWORK_ERROR };
    }
}
/** Exchanges the emailed code for a session, persists it and fetches entitlements. */
async function verifyOtp(email, code) {
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return { ok: false, error: NOT_CONFIGURED_ERROR };
    const trimmedCode = code.trim();
    if (!trimmedCode)
        return { ok: false, error: 'Please enter the code from your email.' };
    try {
        const res = await supabaseRequest('/auth/v1/verify', {
            method: 'POST',
            body: { type: 'email', email: email.trim(), token: trimmedCode },
        });
        if (res.status >= 400) {
            const raw = extractErrorMessage(res.json, '');
            const friendly = /expired|invalid/i.test(raw)
                ? 'That code is invalid or has expired. Request a new one and try again.'
                : raw || 'Could not verify the code.';
            return { ok: false, error: friendly };
        }
        const session = res.json;
        if (!session?.access_token || !session.refresh_token || !session.user?.id) {
            return { ok: false, error: 'Unexpected response from the account service.' };
        }
        persistAccountSettings({
            email: session.user.email ?? email.trim(),
            userId: session.user.id,
            encryptedRefreshToken: (0, secret_1.encryptSecret)(session.refresh_token),
        });
        accessToken = session.access_token;
        accessTokenExpiresAtMs = Date.now() + (session.expires_in ?? 3600) * 1000;
        // First entitlements fetch — best-effort; a failure must not undo the sign-in.
        try {
            await refreshEntitlements();
        }
        catch { /* refreshEntitlements never throws, but be safe */ }
        notifyStatusChanged();
        return { ok: true };
    }
    catch (err) {
        console.error('[Account] verifyOtp failed:', String(err));
        return { ok: false, error: NETWORK_ERROR };
    }
}
/**
 * Returns a valid access token, refreshing via the persisted refresh token when
 * the in-memory one is missing or expires within 60s. Returns null when there
 * is no session or the refresh token was revoked (session cleared + notified).
 */
async function getAccessToken() {
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return null;
    if (accessToken && accessTokenExpiresAtMs - Date.now() > 60000)
        return accessToken;
    if (refreshInFlight)
        return refreshInFlight;
    refreshInFlight = refreshAccessToken().finally(() => { refreshInFlight = null; });
    return refreshInFlight;
}
async function refreshAccessToken() {
    const s = accountSettings ?? loadAccountSettings();
    if (!s.encryptedRefreshToken)
        return null;
    let refreshToken;
    try {
        refreshToken = (0, secret_1.decryptSecret)(s.encryptedRefreshToken);
    }
    catch (err) {
        // Undecryptable (keyring changed, corrupted value) — session is unusable.
        console.error('[Account] failed to decrypt refresh token:', String(err));
        clearSession();
        notifyStatusChanged();
        return null;
    }
    try {
        const res = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            body: { refresh_token: refreshToken },
        });
        if (res.status === 400 || res.status === 401) {
            // Refresh token revoked/expired — the user is effectively signed out.
            console.warn('[Account] refresh token rejected — signing out');
            clearSession();
            notifyStatusChanged();
            return null;
        }
        if (res.status >= 400) {
            console.error('[Account] token refresh failed:', extractErrorMessage(res.json, `HTTP ${res.status}`));
            return null; // transient server error — keep the session, caller can retry later
        }
        const session = res.json;
        if (!session?.access_token)
            return null;
        accessToken = session.access_token;
        accessTokenExpiresAtMs = Date.now() + (session.expires_in ?? 3600) * 1000;
        // GoTrue ROTATES the refresh token on every grant — persist the new one or
        // the next refresh would present a consumed token and get signed out.
        if (session.refresh_token) {
            persistAccountSettings({ ...s, encryptedRefreshToken: (0, secret_1.encryptSecret)(session.refresh_token) });
        }
        return accessToken;
    }
    catch (err) {
        // Network/timeout — keep the session; a later call will retry.
        console.error('[Account] token refresh network error:', String(err));
        return null;
    }
}
/** Revokes the session server-side (best-effort) and clears local state. */
async function signOut() {
    const token = accessToken; // don't mint a fresh token just to revoke it
    if (token) {
        try {
            await supabaseRequest('/auth/v1/logout', { method: 'POST', accessToken: token });
        }
        catch (err) {
            console.warn('[Account] logout request failed (ignored):', String(err));
        }
    }
    clearSession();
    notifyStatusChanged();
    return { ok: true };
}
/** Re-reads the user's subscription rows and re-derives {ai, cloud}. */
async function refreshEntitlements() {
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return { ok: false, error: NOT_CONFIGURED_ERROR, entitlements: entitlements_1.NO_ENTITLEMENTS };
    const token = await getAccessToken();
    if (!token) {
        return { ok: false, error: 'Not signed in.', entitlements: entitlements_1.NO_ENTITLEMENTS };
    }
    try {
        const res = await supabaseRequest('/rest/v1/subscriptions?select=product,status,renews_at', {
            accessToken: token,
        });
        if (res.status >= 400) {
            return {
                ok: false,
                error: extractErrorMessage(res.json, 'Could not load subscription status.'),
                entitlements,
            };
        }
        entitlements = (0, entitlements_1.computeEntitlements)(res.json);
        entitlementsFetchedAt = new Date().toISOString();
        notifyStatusChanged();
        return { ok: true, entitlements };
    }
    catch (err) {
        console.error('[Account] refreshEntitlements failed:', String(err));
        return { ok: false, error: NETWORK_ERROR, entitlements };
    }
}
/**
 * App-startup hook: if a session is persisted, refresh entitlements in the
 * background. Deferred so it never competes with the boot path (same spirit as
 * the AI worker warmup).
 */
function initAccount() {
    loadAccountSettings();
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return;
    if (!getAccountStatus().signedIn)
        return;
    setTimeout(() => {
        refreshEntitlements().catch((err) => {
            console.error('[Account] startup entitlements refresh failed:', String(err));
        });
    }, 5000);
}
