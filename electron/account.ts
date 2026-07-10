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

import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { encryptSecret, decryptSecret } from './ai/llm/secret'
import { SUPABASE_URL, SUPABASE_ANON_KEY, LEMONSQUEEZY_CHECKOUT_URLS, isCloudConfigured } from './cloudConfig'
import { computeEntitlements, Entitlements, NO_ENTITLEMENTS, SubscriptionRow } from './entitlements'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AccountSettings {
  email?: string
  userId?: string
  encryptedRefreshToken?: string  // safeStorage-encrypted (base64 fallback), like githubSync's PAT
}

export interface AccountStatus {
  configured: boolean
  signedIn: boolean
  email?: string
  entitlements: Entitlements
  entitlementsFetchedAt?: string  // ISO — when entitlements were last fetched from the server
  /** True when this build ships a Lemon Squeezy checkout URL for NoteFlow AI (gates the Subscribe button). */
  aiCheckoutConfigured: boolean
}

export interface AccountOpResult {
  ok: boolean
  error?: string
}

// ── Settings helpers (same idiom as githubSync) ───────────────────────────────

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

// ── Module state ──────────────────────────────────────────────────────────────

let accountSettings: AccountSettings | null = null

// Access token lives ONLY in memory (GoTrue access tokens expire in ~1h; the
// persisted refresh token mints new ones on demand).
let accessToken: string | null = null
let accessTokenExpiresAtMs = 0

let entitlements: Entitlements = NO_ENTITLEMENTS
let entitlementsFetchedAt: string | undefined

let statusListener: (() => void) | null = null

// Single-flight guard: GoTrue ROTATES the refresh token on every use, so two
// concurrent refreshes would race — the loser would persist an already-consumed
// token and sign the user out.
let refreshInFlight: Promise<string | null> | null = null

const NOT_CONFIGURED_ERROR = 'NoteFlow account services are not available in this build.'
const NETWORK_ERROR = 'Could not reach the NoteFlow account service. Check your connection and try again.'

// ── HTTP helper ───────────────────────────────────────────────────────────────

interface SupabaseResponse {
  status: number
  json: unknown
}

/** JSON request against the Supabase project. Throws only on network/timeout errors. */
async function supabaseRequest(
  endpoint: string,
  opts: { method?: string; body?: unknown; accessToken?: string } = {}
): Promise<SupabaseResponse> {
  const res = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method: opts.method ?? 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      ...(opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    // 204 / empty body — fine
  }
  return { status: res.status, json }
}

/** Extracts a human-readable message from a GoTrue/PostgREST error payload. */
function extractErrorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    for (const key of ['msg', 'message', 'error_description', 'error']) {
      if (typeof o[key] === 'string' && o[key]) return o[key] as string
    }
  }
  return fallback
}

// ── Session persistence ───────────────────────────────────────────────────────

export function loadAccountSettings(): AccountSettings {
  const settings = readSettings()
  accountSettings = (settings.account as AccountSettings) ?? {}
  return accountSettings
}

function persistAccountSettings(next: AccountSettings): void {
  accountSettings = next
  const settings = readSettings()
  settings.account = next
  writeSettings(settings)
}

function clearSession(): void {
  accountSettings = {}
  accessToken = null
  accessTokenExpiresAtMs = 0
  entitlements = NO_ENTITLEMENTS
  entitlementsFetchedAt = undefined
  const settings = readSettings()
  delete settings.account
  writeSettings(settings)
}

function notifyStatusChanged(): void {
  statusListener?.()
}

// ── Public API ────────────────────────────────────────────────────────────────

export function onStatusChanged(cb: () => void): void {
  statusListener = cb
}

export function getAccountStatus(): AccountStatus {
  const s = accountSettings ?? loadAccountSettings()
  const configured = isCloudConfigured()
  const signedIn = configured && !!(s.encryptedRefreshToken && s.userId)
  return {
    configured,
    signedIn,
    email: signedIn ? s.email : undefined,
    entitlements: signedIn ? entitlements : NO_ENTITLEMENTS,
    entitlementsFetchedAt: signedIn ? entitlementsFetchedAt : undefined,
    aiCheckoutConfigured: LEMONSQUEEZY_CHECKOUT_URLS.ai.length > 0,
  }
}

/** Supabase user id of the signed-in session (main-process only — used to tag
 *  the Lemon Squeezy checkout; it never crosses to the renderer). */
export function getUserId(): string | null {
  const s = accountSettings ?? loadAccountSettings()
  return s.userId ?? null
}

/** Emails a 6-digit one-time code (creates the account on first sign-in). */
export async function requestOtp(email: string): Promise<AccountOpResult> {
  if (!isCloudConfigured()) return { ok: false, error: NOT_CONFIGURED_ERROR }
  const trimmed = email.trim()
  if (!trimmed || !trimmed.includes('@')) return { ok: false, error: 'Please enter a valid email address.' }

  try {
    const res = await supabaseRequest('/auth/v1/otp', {
      method: 'POST',
      body: { email: trimmed, create_user: true },
    })
    if (res.status >= 400) {
      if (res.status === 429) return { ok: false, error: 'Too many attempts. Please wait a moment and try again.' }
      return { ok: false, error: extractErrorMessage(res.json, 'Could not send the sign-in code.') }
    }
    return { ok: true }
  } catch (err: unknown) {
    console.error('[Account] requestOtp failed:', String(err))
    return { ok: false, error: NETWORK_ERROR }
  }
}

/** Exchanges the emailed code for a session, persists it and fetches entitlements. */
export async function verifyOtp(email: string, code: string): Promise<AccountOpResult> {
  if (!isCloudConfigured()) return { ok: false, error: NOT_CONFIGURED_ERROR }
  const trimmedCode = code.trim()
  if (!trimmedCode) return { ok: false, error: 'Please enter the code from your email.' }

  try {
    const res = await supabaseRequest('/auth/v1/verify', {
      method: 'POST',
      body: { type: 'email', email: email.trim(), token: trimmedCode },
    })
    if (res.status >= 400) {
      const raw = extractErrorMessage(res.json, '')
      const friendly = /expired|invalid/i.test(raw)
        ? 'That code is invalid or has expired. Request a new one and try again.'
        : raw || 'Could not verify the code.'
      return { ok: false, error: friendly }
    }

    const session = res.json as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      user?: { id?: string; email?: string }
    }
    if (!session?.access_token || !session.refresh_token || !session.user?.id) {
      return { ok: false, error: 'Unexpected response from the account service.' }
    }

    persistAccountSettings({
      email: session.user.email ?? email.trim(),
      userId: session.user.id,
      encryptedRefreshToken: encryptSecret(session.refresh_token),
    })
    accessToken = session.access_token
    accessTokenExpiresAtMs = Date.now() + (session.expires_in ?? 3600) * 1000

    // First entitlements fetch — best-effort; a failure must not undo the sign-in.
    try {
      await refreshEntitlements()
    } catch { /* refreshEntitlements never throws, but be safe */ }

    notifyStatusChanged()
    return { ok: true }
  } catch (err: unknown) {
    console.error('[Account] verifyOtp failed:', String(err))
    return { ok: false, error: NETWORK_ERROR }
  }
}

/**
 * Returns a valid access token, refreshing via the persisted refresh token when
 * the in-memory one is missing or expires within 60s. Returns null when there
 * is no session or the refresh token was revoked (session cleared + notified).
 */
export async function getAccessToken(): Promise<string | null> {
  if (!isCloudConfigured()) return null
  if (accessToken && accessTokenExpiresAtMs - Date.now() > 60_000) return accessToken

  if (refreshInFlight) return refreshInFlight
  refreshInFlight = refreshAccessToken().finally(() => { refreshInFlight = null })
  return refreshInFlight
}

async function refreshAccessToken(): Promise<string | null> {
  const s = accountSettings ?? loadAccountSettings()
  if (!s.encryptedRefreshToken) return null

  let refreshToken: string
  try {
    refreshToken = decryptSecret(s.encryptedRefreshToken)
  } catch (err: unknown) {
    // Undecryptable (keyring changed, corrupted value) — session is unusable.
    console.error('[Account] failed to decrypt refresh token:', String(err))
    clearSession()
    notifyStatusChanged()
    return null
  }

  try {
    const res = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    })
    if (res.status === 400 || res.status === 401) {
      // Refresh token revoked/expired — the user is effectively signed out.
      console.warn('[Account] refresh token rejected — signing out')
      clearSession()
      notifyStatusChanged()
      return null
    }
    if (res.status >= 400) {
      console.error('[Account] token refresh failed:', extractErrorMessage(res.json, `HTTP ${res.status}`))
      return null // transient server error — keep the session, caller can retry later
    }

    const session = res.json as { access_token?: string; refresh_token?: string; expires_in?: number }
    if (!session?.access_token) return null

    accessToken = session.access_token
    accessTokenExpiresAtMs = Date.now() + (session.expires_in ?? 3600) * 1000
    // GoTrue ROTATES the refresh token on every grant — persist the new one or
    // the next refresh would present a consumed token and get signed out.
    if (session.refresh_token) {
      persistAccountSettings({ ...s, encryptedRefreshToken: encryptSecret(session.refresh_token) })
    }
    return accessToken
  } catch (err: unknown) {
    // Network/timeout — keep the session; a later call will retry.
    console.error('[Account] token refresh network error:', String(err))
    return null
  }
}

/** Revokes the session server-side (best-effort) and clears local state. */
export async function signOut(): Promise<AccountOpResult> {
  const token = accessToken // don't mint a fresh token just to revoke it
  if (token) {
    try {
      await supabaseRequest('/auth/v1/logout', { method: 'POST', accessToken: token })
    } catch (err: unknown) {
      console.warn('[Account] logout request failed (ignored):', String(err))
    }
  }
  clearSession()
  notifyStatusChanged()
  return { ok: true }
}

/** Re-reads the user's subscription rows and re-derives {ai, cloud}. */
export async function refreshEntitlements(): Promise<AccountOpResult & { entitlements: Entitlements }> {
  if (!isCloudConfigured()) return { ok: false, error: NOT_CONFIGURED_ERROR, entitlements: NO_ENTITLEMENTS }

  const token = await getAccessToken()
  if (!token) {
    return { ok: false, error: 'Not signed in.', entitlements: NO_ENTITLEMENTS }
  }

  try {
    const res = await supabaseRequest('/rest/v1/subscriptions?select=product,status,renews_at', {
      accessToken: token,
    })
    if (res.status >= 400) {
      return {
        ok: false,
        error: extractErrorMessage(res.json, 'Could not load subscription status.'),
        entitlements,
      }
    }
    entitlements = computeEntitlements(res.json as SubscriptionRow[])
    entitlementsFetchedAt = new Date().toISOString()
    notifyStatusChanged()
    return { ok: true, entitlements }
  } catch (err: unknown) {
    console.error('[Account] refreshEntitlements failed:', String(err))
    return { ok: false, error: NETWORK_ERROR, entitlements }
  }
}

/**
 * App-startup hook: if a session is persisted, refresh entitlements in the
 * background. Deferred so it never competes with the boot path (same spirit as
 * the AI worker warmup).
 */
export function initAccount(): void {
  loadAccountSettings()
  if (!isCloudConfigured()) return
  if (!getAccountStatus().signedIn) return
  setTimeout(() => {
    refreshEntitlements().catch((err) => {
      console.error('[Account] startup entitlements refresh failed:', String(err))
    })
  }, 5_000)
}
