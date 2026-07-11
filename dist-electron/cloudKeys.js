"use strict";
// NoteFlow Cloud E2EE key session (phase 4.2, stage 2) — main-process only.
//
// Manages the user's DEK (master key) lifecycle against public.user_keys
// (migration 0004): setup generates DEK + recovery code and uploads the two
// wrapped copies; unlock downloads them and unwraps with the passphrase (or
// the recovery code); lock drops the DEK. Crypto primitives live in
// cloudCrypto.ts (pure); REST follows the account.ts pattern (plain fetch, a
// fresh access token per request via account.getAccessToken()).
//
// Security model:
//   - The DEK lives ONLY in main-process memory. It never crosses to the
//     renderer and is never written to disk in the clear.
//   - Optional convenience cache: the DEK is persisted encrypted with OS-level
//     safeStorage in settings.json (cloudSync.encryptedDek) so the passphrase
//     isn't asked on every boot — ONLY when safeStorage is really available
//     (never the base64 fallback used for tokens: a base64'd master key on
//     disk would void the E2EE promise). Cleared by lockCloudKeys().
//   - The recovery code is returned ONCE by setupCloudKeys and never persisted
//     or logged anywhere.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseRest = supabaseRest;
exports.getKeysState = getKeysState;
exports.getDek = getDek;
exports.initCloudKeys = initCloudKeys;
exports.setupCloudKeys = setupCloudKeys;
exports.unlockCloudKeys = unlockCloudKeys;
exports.lockCloudKeys = lockCloudKeys;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const account = __importStar(require("./account"));
const cloudConfig_1 = require("./cloudConfig");
const secret_1 = require("./ai/llm/secret");
const cloudCrypto_1 = require("./cloudCrypto");
// ── Settings helpers (same idiom as account.ts / githubSync.ts) ───────────────
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
// Merges a patch into the cloudSync section without clobbering fields owned by
// cloudSync.ts (enabled/lastSync/pullCursor) — both modules read-modify-write
// the same settings.json section.
function patchCloudSection(patch) {
    const settings = readSettings();
    const section = settings.cloudSync ?? {};
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined)
            delete section[key];
        else
            section[key] = value;
    }
    settings.cloudSync = section;
    writeSettings(settings);
}
/**
 * Authenticated PostgREST request with a FRESH access token per call (GoTrue
 * tokens expire in ~1h — never cache them as if they were API keys). Throws on
 * network/timeout errors or when there is no signed-in session.
 */
async function supabaseRest(endpoint, opts = {}) {
    const token = await account.getAccessToken();
    if (!token)
        throw new Error('not-signed-in');
    const res = await fetch(`${cloudConfig_1.SUPABASE_URL}${endpoint}`, {
        method: opts.method ?? 'GET',
        headers: {
            apikey: cloudConfig_1.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(opts.headers ?? {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(15000),
    });
    let json = null;
    try {
        json = await res.json();
    }
    catch {
        // 201/204 with empty body — fine
    }
    return { status: res.status, json };
}
// ── Module state ──────────────────────────────────────────────────────────────
// The DEK — main-process memory only.
let dek = null;
// Whether the account has a user_keys row: null = not checked yet this session.
let remoteKeysKnown = null;
const NOT_SIGNED_IN_ERROR = 'Sign in to your NoteFlow account first.';
const NETWORK_ERROR = 'Could not reach the NoteFlow Cloud service. Check your connection and try again.';
// ── Public API ────────────────────────────────────────────────────────────────
function getKeysState() {
    if (dek)
        return 'unlocked';
    if (remoteKeysKnown === false)
        return 'no-keys';
    return 'locked';
}
/** The raw DEK for cloudSync.ts (main-process only — NEVER expose over IPC). */
function getDek() {
    return dek;
}
/**
 * App-startup hook: restores the DEK from the safeStorage cache (if present
 * and decryptable) so an already-set-up device boots unlocked.
 */
function initCloudKeys() {
    const section = readSettings().cloudSync ?? {};
    const cached = section.encryptedDek;
    if (typeof cached !== 'string' || !cached)
        return;
    try {
        const raw = (0, cloudCrypto_1.fromB64Url)((0, secret_1.decryptSecret)(cached));
        if (raw.length !== cloudCrypto_1.KEY_BYTES)
            throw new Error(`cached DEK has ${raw.length} bytes`);
        dek = raw;
        remoteKeysKnown = true; // a cached DEK implies setup/unlock succeeded before
    }
    catch (err) {
        // Keyring changed or value corrupted — drop the cache; the user re-unlocks.
        console.error('[CloudKeys] failed to restore cached DEK:', String(err));
        patchCloudSection({ encryptedDek: undefined });
    }
}
function cacheDek() {
    if (!dek)
        return;
    // safeStorage ONLY — never write the master key with the base64 fallback.
    if (!electron_1.safeStorage.isEncryptionAvailable())
        return;
    try {
        patchCloudSection({ encryptedDek: (0, secret_1.encryptSecret)((0, cloudCrypto_1.toB64Url)(dek)) });
    }
    catch (err) {
        console.error('[CloudKeys] failed to cache DEK:', String(err));
    }
}
/**
 * First-time Cloud setup: generates the DEK + recovery code, wraps the DEK with
 * the passphrase KEK and the recovery KEK, and uploads the user_keys row.
 * Returns the recovery code — shown ONCE to the user, never persisted.
 */
async function setupCloudKeys(passphrase) {
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return { ok: false, error: 'NoteFlow Cloud is not available in this build.' };
    if (passphrase.length < 8)
        return { ok: false, error: 'The passphrase must be at least 8 characters long.' };
    try {
        // Refuse to overwrite existing keys — replacing the DEK would orphan every
        // row already encrypted with it. (Key rotation is a future, explicit flow.)
        const existing = await supabaseRest('/rest/v1/user_keys?select=user_id');
        if (existing.status >= 400) {
            return { ok: false, error: `Could not check existing cloud keys (HTTP ${existing.status}).` };
        }
        if (Array.isArray(existing.json) && existing.json.length > 0) {
            remoteKeysKnown = true;
            return { ok: false, error: 'Cloud keys already exist for this account. Unlock them with your passphrase instead.' };
        }
        const userId = account.getUserId();
        if (!userId)
            return { ok: false, error: NOT_SIGNED_IN_ERROR };
        const newDek = (0, cloudCrypto_1.generateDek)();
        const recoveryCode = (0, cloudCrypto_1.generateRecoveryCode)();
        const passSalt = (0, cloudCrypto_1.generateKdfSalt)();
        const recoverySalt = (0, cloudCrypto_1.generateKdfSalt)();
        const passKek = await (0, cloudCrypto_1.deriveKek)(passphrase, passSalt, cloudCrypto_1.DEFAULT_KDF_ITERATIONS);
        const recoveryKek = await (0, cloudCrypto_1.deriveRecoveryKek)(recoveryCode, recoverySalt, cloudCrypto_1.DEFAULT_KDF_ITERATIONS);
        const res = await supabaseRest('/rest/v1/user_keys', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: {
                user_id: userId,
                dek_pass_ct: await (0, cloudCrypto_1.wrapKey)(newDek, passKek),
                pass_salt: (0, cloudCrypto_1.toB64Url)(passSalt),
                pass_iterations: cloudCrypto_1.DEFAULT_KDF_ITERATIONS,
                dek_recovery_ct: await (0, cloudCrypto_1.wrapKey)(newDek, recoveryKek),
                recovery_salt: (0, cloudCrypto_1.toB64Url)(recoverySalt),
                recovery_iterations: cloudCrypto_1.DEFAULT_KDF_ITERATIONS,
            },
        });
        if (res.status >= 400) {
            return { ok: false, error: `Could not store the cloud keys (HTTP ${res.status}).` };
        }
        dek = newDek;
        remoteKeysKnown = true;
        cacheDek();
        return { ok: true, recoveryCode };
    }
    catch (err) {
        if (String(err).includes('not-signed-in'))
            return { ok: false, error: NOT_SIGNED_IN_ERROR };
        console.error('[CloudKeys] setup failed:', String(err));
        return { ok: false, error: NETWORK_ERROR };
    }
}
/**
 * Unlocks the key session: downloads user_keys and unwraps the DEK with the
 * given secret — tried as passphrase first, then as recovery code when it has
 * the exact shape of one (30 normalized chars; checked BEFORE deriving so a
 * mistyped passphrase gets a clear error instead of a silent KDF mismatch).
 */
async function unlockCloudKeys(secret) {
    if (!(0, cloudConfig_1.isCloudConfigured)())
        return { ok: false, error: 'NoteFlow Cloud is not available in this build.' };
    if (!secret)
        return { ok: false, error: 'Enter your passphrase or recovery code.' };
    let row;
    try {
        const res = await supabaseRest('/rest/v1/user_keys?select=dek_pass_ct,pass_salt,pass_iterations,dek_recovery_ct,recovery_salt,recovery_iterations');
        if (res.status >= 400) {
            return { ok: false, error: `Could not load the cloud keys (HTTP ${res.status}).` };
        }
        const rows = Array.isArray(res.json) ? res.json : [];
        if (rows.length === 0) {
            remoteKeysKnown = false;
            return { ok: false, error: 'No cloud keys exist for this account yet. Set up NoteFlow Cloud first.' };
        }
        remoteKeysKnown = true;
        row = rows[0];
    }
    catch (err) {
        if (String(err).includes('not-signed-in'))
            return { ok: false, error: NOT_SIGNED_IN_ERROR };
        console.error('[CloudKeys] unlock fetch failed:', String(err));
        return { ok: false, error: NETWORK_ERROR };
    }
    // 1) As passphrase.
    try {
        const kek = await (0, cloudCrypto_1.deriveKek)(secret, (0, cloudCrypto_1.fromB64Url)(row.pass_salt), row.pass_iterations);
        dek = await (0, cloudCrypto_1.unwrapKey)(row.dek_pass_ct, kek);
        cacheDek();
        return { ok: true };
    }
    catch {
        // wrong passphrase — maybe it's the recovery code
    }
    // 2) As recovery code — only when it actually has the shape of one.
    if ((0, cloudCrypto_1.looksLikeRecoveryCode)(secret)) {
        try {
            const kek = await (0, cloudCrypto_1.deriveRecoveryKek)(secret, (0, cloudCrypto_1.fromB64Url)(row.recovery_salt), row.recovery_iterations);
            dek = await (0, cloudCrypto_1.unwrapKey)(row.dek_recovery_ct, kek);
            cacheDek();
            return { ok: true };
        }
        catch {
            return { ok: false, error: 'Incorrect passphrase or recovery code.' };
        }
    }
    return { ok: false, error: 'Incorrect passphrase.' };
}
/** Drops the in-memory DEK and the safeStorage cache. Sync gates itself off. */
function lockCloudKeys() {
    dek = null;
    patchCloudSection({ encryptedDek: undefined });
}
