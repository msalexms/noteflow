// Supabase Edge Function: cloud-keys — NoteFlow Cloud MANAGED encryption mode.
// Zero external dependencies (fetch only — same philosophy as ai-proxy). All
// testable logic lives in ./logic.ts; this file is just the Deno glue: env,
// HTTP routing and Supabase REST calls.
//
// In managed (standard) mode the user keeps no secret: the client generates
// the DEK and deposits it here, wrapped by the OPERATOR key (CLOUD_MANAGED_KEK)
// — never stored in the clear. The trade-off is honest and documented in the
// UI: NoteFlow could technically read managed users' notes; privacy-conscious
// users pick the e2ee mode (passphrase + recovery, no server involvement).
//
//   POST <fn>/setup    body {dek: base64url(32 bytes)} → wraps the DEK with the
//                      operator KEK and inserts the user_keys row (mode
//                      'managed'). 409 if the account already has keys — same
//                      contract as the client-side e2ee setup.
//   POST <fn>/unlock   no body → returns {dek} unwrapped when the caller's row
//                      exists and is managed. 404 without a row; 409 when the
//                      row is e2ee (that unlock is local, with the passphrase).
//   POST <fn>/downgrade body {dek: base64url(32 bytes)} → explicit e2ee →
//                      managed switch: the client sends its unlocked DEK (same
//                      trust as setup), which gets wrapped with the operator
//                      KEK; the row flips to mode 'managed' and every
//                      passphrase/recovery column is nulled (they stop
//                      working — intentional). 404 without a row; 409 when the
//                      row is already managed.
//
// No endpoint checks entitlements: key material must always be creatable/
// readable, also with a lapsed subscription (mirror of the user_keys RLS).
//
// Auth: `Authorization: Bearer <Supabase access token>` — resolved to a user
// id via /auth/v1/user (exact ai-proxy pattern). Deploy WITH JWT verification
// (the default; no --no-verify-jwt).
//
// Env (set via `supabase secrets set`, except the SUPABASE_* ones which the
// platform injects automatically):
//   CLOUD_MANAGED_KEK    operator wrapping key: 32 bytes in base64
//                        (openssl rand -base64 32) — the ONLY secret here
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY  injected

import {
  parseManagedKek,
  parseDekParam,
  wrapDek,
  unwrapDek,
  toB64Url,
  resolveRoute,
  keysErrorBody,
} from './logic.ts'

// Minimal surface of the globals we use (this file is deployed to Deno; it is
// excluded from the repo's tsc builds, which know nothing about Deno).
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): unknown
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function serviceHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const route = resolveRoute(req.method, new URL(req.url).pathname)
  if (!route) return json(404, keysErrorBody('Not found.', 'not_found'))

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('cloud-keys: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY missing')
    return json(500, keysErrorBody('NoteFlow Cloud is not configured.', 'not_configured'))
  }
  const kek = parseManagedKek(Deno.env.get('CLOUD_MANAGED_KEK'))
  if (!kek) {
    console.error('cloud-keys: CLOUD_MANAGED_KEK is missing or not 32 base64 bytes')
    return json(500, keysErrorBody('NoteFlow Cloud is not configured.', 'not_configured'))
  }

  // ── Auth: resolve the caller's Supabase access token to a user id ──────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return json(401, keysErrorBody('Missing NoteFlow session. Sign in from Settings → Account.', 'missing_token'))
  }
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  if (!userRes.ok) {
    return json(
      401,
      keysErrorBody('Invalid or expired NoteFlow session. Sign in again from Settings → Account.', 'invalid_token')
    )
  }
  const user = (await userRes.json().catch(() => null)) as { id?: string } | null
  const userId = user?.id
  if (!userId) {
    return json(401, keysErrorBody('Could not resolve the NoteFlow session.', 'invalid_token'))
  }

  // ── Fetch the caller's user_keys row (service role, explicit user_id filter) ─
  const rowRes = await fetch(
    `${supabaseUrl}/rest/v1/user_keys?user_id=eq.${userId}&select=mode,dek_managed_ct`,
    { headers: serviceHeaders(serviceRoleKey) }
  )
  if (!rowRes.ok) {
    console.error(`cloud-keys: user_keys query failed (${rowRes.status})`)
    return json(500, keysErrorBody('Could not load the cloud keys. Try again.', 'keys_query_failed'))
  }
  const rows = (await rowRes.json().catch(() => null)) as Array<{
    mode?: string
    dek_managed_ct?: string | null
  }> | null

  if (route === 'setup') {
    // Same contract as the e2ee setup: never overwrite existing keys —
    // replacing the DEK would orphan every row already encrypted with it.
    if (Array.isArray(rows) && rows.length > 0) {
      return json(409, keysErrorBody('Cloud keys already exist for this account.', 'already_exists'))
    }
    const body: unknown = await req.json().catch(() => null)
    const dek = parseDekParam(body)
    if (!dek) {
      return json(400, keysErrorBody('Body must be {dek: base64url of 32 bytes}.', 'invalid_dek'))
    }
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/user_keys`, {
      method: 'POST',
      headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        mode: 'managed',
        dek_managed_ct: await wrapDek(dek, kek),
      }),
    })
    if (insertRes.status === 409) {
      // Raced with another device's setup — same answer as the pre-check.
      return json(409, keysErrorBody('Cloud keys already exist for this account.', 'already_exists'))
    }
    if (!insertRes.ok) {
      const detail = await insertRes.text().catch(() => '')
      console.error(`cloud-keys: user_keys insert failed (${insertRes.status}): ${detail}`)
      return json(500, keysErrorBody('Could not store the cloud keys. Try again.', 'insert_failed'))
    }
    return json(200, { ok: true })
  }

  if (route === 'downgrade') {
    // Explicit e2ee → managed switch (user-confirmed in the UI — never silent).
    // The caller proves possession of the DEK by sending it (it only has it
    // while unlocked); the row must exist and be e2ee.
    if (!Array.isArray(rows) || rows.length === 0) {
      return json(404, keysErrorBody('No cloud keys exist for this account yet.', 'no_keys'))
    }
    if (rows[0].mode === 'managed') {
      return json(409, keysErrorBody('This account already uses standard encryption.', 'already_managed'))
    }
    const body: unknown = await req.json().catch(() => null)
    const dek = parseDekParam(body)
    if (!dek) {
      return json(400, keysErrorBody('Body must be {dek: base64url of 32 bytes}.', 'invalid_dek'))
    }
    // Null every passphrase/recovery column: after the downgrade neither the
    // passphrase nor the recovery code works — unlocking is session-automatic.
    // The user_keys_mode_coherent CHECK (migration 0005) allows this end state.
    const patchRes = await fetch(`${supabaseUrl}/rest/v1/user_keys?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
      body: JSON.stringify({
        mode: 'managed',
        dek_managed_ct: await wrapDek(dek, kek),
        dek_pass_ct: null,
        pass_salt: null,
        pass_iterations: null,
        dek_recovery_ct: null,
        recovery_salt: null,
        recovery_iterations: null,
        updated_at: new Date().toISOString(),
      }),
    })
    if (!patchRes.ok) {
      const detail = await patchRes.text().catch(() => '')
      console.error(`cloud-keys: user_keys downgrade failed (${patchRes.status}): ${detail}`)
      return json(500, keysErrorBody('Could not switch to standard encryption. Try again.', 'downgrade_failed'))
    }
    return json(200, { ok: true })
  }

  // route === 'unlock'
  if (!Array.isArray(rows) || rows.length === 0) {
    return json(404, keysErrorBody('No cloud keys exist for this account yet.', 'no_keys'))
  }
  const row = rows[0]
  if (row.mode !== 'managed' || !row.dek_managed_ct) {
    return json(
      409,
      keysErrorBody('This account uses private end-to-end encryption. Unlock locally with your passphrase.', 'e2ee_mode')
    )
  }
  try {
    const dek = await unwrapDek(row.dek_managed_ct, kek)
    return json(200, { dek: toB64Url(dek) })
  } catch (err) {
    // Wrong CLOUD_MANAGED_KEK (rotated?) or corrupted blob — operator problem.
    console.error('cloud-keys: unwrap failed:', err)
    return json(500, keysErrorBody('Could not unwrap the cloud keys.', 'unwrap_failed'))
  }
})
