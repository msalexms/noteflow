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

import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import * as account from './account'
import { SUPABASE_URL, SUPABASE_ANON_KEY, isCloudConfigured } from './cloudConfig'
import { encryptSecret, decryptSecret } from './ai/llm/secret'
import {
  KEY_BYTES,
  DEFAULT_KDF_ITERATIONS,
  toB64Url,
  fromB64Url,
  generateDek,
  generateKdfSalt,
  generateRecoveryCode,
  looksLikeRecoveryCode,
  deriveKek,
  deriveRecoveryKek,
  wrapKey,
  unwrapKey,
} from './cloudCrypto'

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * 'unlocked' — DEK in memory, sync can encrypt/decrypt.
 * 'locked'   — no DEK in memory (keys may exist server-side, or presence unknown).
 * 'no-keys'  — confirmed that the account has no user_keys row yet (setup needed).
 */
export type CloudKeysState = 'unlocked' | 'locked' | 'no-keys'

export interface CloudKeysOpResult {
  ok: boolean
  error?: string
}

interface UserKeysRow {
  dek_pass_ct: string
  pass_salt: string
  pass_iterations: number
  dek_recovery_ct: string
  recovery_salt: string
  recovery_iterations: number
}

// ── Settings helpers (same idiom as account.ts / githubSync.ts) ───────────────

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(data: Record<string, unknown>): void {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(data), 'utf-8')
}

// Merges a patch into the cloudSync section without clobbering fields owned by
// cloudSync.ts (enabled/lastSync/pullCursor) — both modules read-modify-write
// the same settings.json section.
function patchCloudSection(patch: Record<string, unknown>): void {
  const settings = readSettings()
  const section = (settings.cloudSync as Record<string, unknown>) ?? {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete section[key]
    else section[key] = value
  }
  settings.cloudSync = section
  writeSettings(settings)
}

// ── Supabase REST helper (shared with cloudSync.ts) ───────────────────────────

export interface SupabaseRestResponse {
  status: number
  json: unknown
}

/**
 * Authenticated PostgREST request with a FRESH access token per call (GoTrue
 * tokens expire in ~1h — never cache them as if they were API keys). Throws on
 * network/timeout errors or when there is no signed-in session.
 */
export async function supabaseRest(
  endpoint: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<SupabaseRestResponse> {
  const token = await account.getAccessToken()
  if (!token) throw new Error('not-signed-in')
  const res = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method: opts.method ?? 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    // 201/204 with empty body — fine
  }
  return { status: res.status, json }
}

// ── Module state ──────────────────────────────────────────────────────────────

// The DEK — main-process memory only.
let dek: Uint8Array | null = null

// Whether the account has a user_keys row: null = not checked yet this session.
let remoteKeysKnown: boolean | null = null

const NOT_SIGNED_IN_ERROR = 'Sign in to your NoteFlow account first.'
const NETWORK_ERROR = 'Could not reach the NoteFlow Cloud service. Check your connection and try again.'

// ── Public API ────────────────────────────────────────────────────────────────

export function getKeysState(): CloudKeysState {
  if (dek) return 'unlocked'
  if (remoteKeysKnown === false) return 'no-keys'
  return 'locked'
}

/** The raw DEK for cloudSync.ts (main-process only — NEVER expose over IPC). */
export function getDek(): Uint8Array | null {
  return dek
}

/**
 * App-startup hook: restores the DEK from the safeStorage cache (if present
 * and decryptable) so an already-set-up device boots unlocked.
 */
export function initCloudKeys(): void {
  const section = (readSettings().cloudSync as Record<string, unknown>) ?? {}
  const cached = section.encryptedDek
  if (typeof cached !== 'string' || !cached) return
  try {
    const raw = fromB64Url(decryptSecret(cached))
    if (raw.length !== KEY_BYTES) throw new Error(`cached DEK has ${raw.length} bytes`)
    dek = raw
    remoteKeysKnown = true // a cached DEK implies setup/unlock succeeded before
  } catch (err: unknown) {
    // Keyring changed or value corrupted — drop the cache; the user re-unlocks.
    console.error('[CloudKeys] failed to restore cached DEK:', String(err))
    patchCloudSection({ encryptedDek: undefined })
  }
}

function cacheDek(): void {
  if (!dek) return
  // safeStorage ONLY — never write the master key with the base64 fallback.
  if (!safeStorage.isEncryptionAvailable()) return
  try {
    patchCloudSection({ encryptedDek: encryptSecret(toB64Url(dek)) })
  } catch (err: unknown) {
    console.error('[CloudKeys] failed to cache DEK:', String(err))
  }
}

/**
 * First-time Cloud setup: generates the DEK + recovery code, wraps the DEK with
 * the passphrase KEK and the recovery KEK, and uploads the user_keys row.
 * Returns the recovery code — shown ONCE to the user, never persisted.
 */
export async function setupCloudKeys(
  passphrase: string
): Promise<CloudKeysOpResult & { recoveryCode?: string }> {
  if (!isCloudConfigured()) return { ok: false, error: 'NoteFlow Cloud is not available in this build.' }
  if (passphrase.length < 8) return { ok: false, error: 'The passphrase must be at least 8 characters long.' }

  try {
    // Refuse to overwrite existing keys — replacing the DEK would orphan every
    // row already encrypted with it. (Key rotation is a future, explicit flow.)
    const existing = await supabaseRest('/rest/v1/user_keys?select=user_id')
    if (existing.status >= 400) {
      return { ok: false, error: `Could not check existing cloud keys (HTTP ${existing.status}).` }
    }
    if (Array.isArray(existing.json) && existing.json.length > 0) {
      remoteKeysKnown = true
      return { ok: false, error: 'Cloud keys already exist for this account. Unlock them with your passphrase instead.' }
    }

    const userId = account.getUserId()
    if (!userId) return { ok: false, error: NOT_SIGNED_IN_ERROR }

    const newDek = generateDek()
    const recoveryCode = generateRecoveryCode()
    const passSalt = generateKdfSalt()
    const recoverySalt = generateKdfSalt()
    const passKek = await deriveKek(passphrase, passSalt, DEFAULT_KDF_ITERATIONS)
    const recoveryKek = await deriveRecoveryKek(recoveryCode, recoverySalt, DEFAULT_KDF_ITERATIONS)

    const res = await supabaseRest('/rest/v1/user_keys', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        user_id: userId,
        dek_pass_ct: await wrapKey(newDek, passKek),
        pass_salt: toB64Url(passSalt),
        pass_iterations: DEFAULT_KDF_ITERATIONS,
        dek_recovery_ct: await wrapKey(newDek, recoveryKek),
        recovery_salt: toB64Url(recoverySalt),
        recovery_iterations: DEFAULT_KDF_ITERATIONS,
      },
    })
    if (res.status >= 400) {
      return { ok: false, error: `Could not store the cloud keys (HTTP ${res.status}).` }
    }

    dek = newDek
    remoteKeysKnown = true
    cacheDek()
    return { ok: true, recoveryCode }
  } catch (err: unknown) {
    if (String(err).includes('not-signed-in')) return { ok: false, error: NOT_SIGNED_IN_ERROR }
    console.error('[CloudKeys] setup failed:', String(err))
    return { ok: false, error: NETWORK_ERROR }
  }
}

/**
 * Unlocks the key session: downloads user_keys and unwraps the DEK with the
 * given secret — tried as passphrase first, then as recovery code when it has
 * the exact shape of one (30 normalized chars; checked BEFORE deriving so a
 * mistyped passphrase gets a clear error instead of a silent KDF mismatch).
 */
export async function unlockCloudKeys(secret: string): Promise<CloudKeysOpResult> {
  if (!isCloudConfigured()) return { ok: false, error: 'NoteFlow Cloud is not available in this build.' }
  if (!secret) return { ok: false, error: 'Enter your passphrase or recovery code.' }

  let row: UserKeysRow
  try {
    const res = await supabaseRest(
      '/rest/v1/user_keys?select=dek_pass_ct,pass_salt,pass_iterations,dek_recovery_ct,recovery_salt,recovery_iterations'
    )
    if (res.status >= 400) {
      return { ok: false, error: `Could not load the cloud keys (HTTP ${res.status}).` }
    }
    const rows = Array.isArray(res.json) ? (res.json as UserKeysRow[]) : []
    if (rows.length === 0) {
      remoteKeysKnown = false
      return { ok: false, error: 'No cloud keys exist for this account yet. Set up NoteFlow Cloud first.' }
    }
    remoteKeysKnown = true
    row = rows[0]
  } catch (err: unknown) {
    if (String(err).includes('not-signed-in')) return { ok: false, error: NOT_SIGNED_IN_ERROR }
    console.error('[CloudKeys] unlock fetch failed:', String(err))
    return { ok: false, error: NETWORK_ERROR }
  }

  // 1) As passphrase.
  try {
    const kek = await deriveKek(secret, fromB64Url(row.pass_salt), row.pass_iterations)
    dek = await unwrapKey(row.dek_pass_ct, kek)
    cacheDek()
    return { ok: true }
  } catch {
    // wrong passphrase — maybe it's the recovery code
  }

  // 2) As recovery code — only when it actually has the shape of one.
  if (looksLikeRecoveryCode(secret)) {
    try {
      const kek = await deriveRecoveryKek(secret, fromB64Url(row.recovery_salt), row.recovery_iterations)
      dek = await unwrapKey(row.dek_recovery_ct, kek)
      cacheDek()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Incorrect passphrase or recovery code.' }
    }
  }

  return { ok: false, error: 'Incorrect passphrase.' }
}

/** Drops the in-memory DEK and the safeStorage cache. Sync gates itself off. */
export function lockCloudKeys(): void {
  dek = null
  patchCloudSection({ encryptedDek: undefined })
}
