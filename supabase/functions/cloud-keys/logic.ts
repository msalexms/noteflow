// Pure, runtime-agnostic logic for the cloud-keys Edge Function (NoteFlow
// Cloud managed encryption mode). Deliberately uses ONLY standard Web/JS APIs
// — no Deno.*, no Buffer — so it runs unchanged in the Edge Function (Deno)
// and under vitest on Node. Covered by tests/supabase/cloud-keys.test.ts.
// Same philosophy as ai-proxy/logic.ts and billing-webhook/logic.ts.
//
// What it does: wraps/unwraps the user's DEK with the OPERATOR key
// (CLOUD_MANAGED_KEK secret) using the project-wide sealed-blob format of
// electron/cloudCrypto.ts — base64url(iv 12 bytes || AES-256-GCM ct+tag) —
// so a managed row's dek_managed_ct is indistinguishable in shape from every
// other *_ct column.

export const KEY_BYTES = 32 // AES-256 — DEK and operator KEK
const IV_BYTES = 12

// ── base64url (Web APIs only — no Buffer) ─────────────────────────────────────

export function toB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Strict base64url decode. Returns null on any invalid input (never throws). */
export function fromB64Url(s: string): Uint8Array | null {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) return null
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  try {
    const bin = atob(padded)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

// ── Input parsing / validation ────────────────────────────────────────────────

/**
 * Extracts and validates the client-sent DEK from a parsed setup/downgrade
 * body ({ dek: base64url of exactly 32 bytes }). Returns null on anything else.
 */
export function parseDekParam(body: unknown): Uint8Array | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const raw = (body as Record<string, unknown>).dek
  if (typeof raw !== 'string' || !raw) return null
  const bytes = fromB64Url(raw)
  return bytes && bytes.length === KEY_BYTES ? bytes : null
}

/**
 * Parses the CLOUD_MANAGED_KEK secret: 32 bytes in base64 (standard, as
 * produced by `openssl rand -base64 32`; base64url tolerated). Returns null
 * when missing or malformed — the function must refuse to run rather than
 * derive anything from a bad operator key.
 */
export function parseManagedKek(raw: string | undefined | null): Uint8Array | null {
  if (!raw) return null
  const cleaned = raw.trim().replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const bytes = fromB64Url(cleaned)
  return bytes && bytes.length === KEY_BYTES ? bytes : null
}

// ── AES-256-GCM sealed blobs (mirror of electron/cloudCrypto.ts) ──────────────

async function importAesKey(raw: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  if (raw.length !== KEY_BYTES) {
    throw new Error(`cloud-keys: expected a ${KEY_BYTES}-byte key, got ${raw.length}`)
  }
  return crypto.subtle.importKey('raw', raw as unknown as ArrayBuffer, { name: 'AES-GCM' }, false, [usage])
}

/** Wraps the DEK under the operator KEK → sealed blob for user_keys.dek_managed_ct. */
export async function wrapDek(dek: Uint8Array, kek: Uint8Array): Promise<string> {
  if (dek.length !== KEY_BYTES) {
    throw new Error(`cloud-keys: expected a ${KEY_BYTES}-byte DEK, got ${dek.length}`)
  }
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await importAesKey(kek, 'encrypt')
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, dek as unknown as ArrayBuffer)
  )
  const blob = new Uint8Array(IV_BYTES + ct.length)
  blob.set(iv)
  blob.set(ct, IV_BYTES)
  return toB64Url(blob)
}

/** Unwraps dek_managed_ct. Throws on a wrong KEK or tampered blob (GCM tag mismatch). */
export async function unwrapDek(sealed: string, kek: Uint8Array): Promise<Uint8Array> {
  const blob = fromB64Url(sealed)
  if (!blob || blob.length <= IV_BYTES) throw new Error('cloud-keys: sealed blob too short')
  const key = await importAesKey(kek, 'decrypt')
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: blob.subarray(0, IV_BYTES) },
      key,
      blob.subarray(IV_BYTES) as unknown as ArrayBuffer
    )
  )
  if (plain.length !== KEY_BYTES) {
    throw new Error(`cloud-keys: unwrapped DEK has ${plain.length} bytes, expected ${KEY_BYTES}`)
  }
  return plain
}

// ── HTTP surface helpers ──────────────────────────────────────────────────────

export type CloudKeysRoute = 'setup' | 'unlock' | 'downgrade'

/** POST <fn>/setup | POST <fn>/unlock | POST <fn>/downgrade — anything else is a 404. */
export function resolveRoute(method: string, pathname: string): CloudKeysRoute | null {
  if (method !== 'POST') return null
  if (pathname.endsWith('/setup')) return 'setup'
  if (pathname.endsWith('/unlock')) return 'unlock'
  if (pathname.endsWith('/downgrade')) return 'downgrade'
  return null
}

/** Error body shape shared with the desktop client (electron/cloudKeys.ts). */
export function keysErrorBody(
  message: string,
  code: string
): { error: { message: string; code: string } } {
  return { error: { message, code } }
}
