// Supabase Edge Function: NoteFlow AI proxy (managed LLM plan).
// Zero external dependencies (fetch + Web Streams only — same philosophy as
// billing-webhook). All testable logic lives in ./logic.ts; this file is just
// the Deno glue: env, HTTP routing, Supabase REST calls and stream plumbing.
//
// OpenAI-compatible surface (the client's `noteflow` preset points its
// baseUrl at .../functions/v1/ai-proxy and reuses OpenAiCompatibleProvider):
//   POST <fn>/chat/completions   → auth + entitlement + quota → OpenRouter
//   GET  <fn>/models             → auth + entitlement → curated model list
//
// Auth: `Authorization: Bearer <Supabase access token>` — the user JWT the
// desktop app mints from its account session. Deploy WITH JWT verification
// (the default; no --no-verify-jwt): the gateway pre-validates the JWT, and we
// still resolve it to a user id via /auth/v1/user below.
//
// Metering: the request body forwarded to OpenRouter carries
// `usage: {include: true}`, so the final SSE chunk (or the JSON response)
// includes the token usage block; the response stream is tee'd, scanned for
// that block, and a usage_events row is inserted (best-effort) when it ends.
//
// Env (set via `supabase secrets set`, except the SUPABASE_* ones which the
// platform injects automatically):
//   OPENROUTER_API_KEY   upstream key (the only one; secret)
//   AI_MONTHLY_TOKENS    optional per-user monthly budget (default 3,000,000)
//   AI_ALLOWED_MODELS    optional comma-separated model allowlist override
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY  injected

import {
  parseAllowedModels,
  parseMonthlyTokens,
  isModelAllowed,
  hasAiEntitlement,
  computeQuota,
  openAiErrorBody,
  modelsListBody,
  buildUpstreamBody,
  extractUsageFromJson,
  createSseUsageScanner,
  type TokenUsage,
} from './logic.ts'

// Minimal surface of the globals we use (this file is deployed to Deno; it is
// excluded from the repo's tsc builds, which know nothing about Deno).
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): unknown
}
// Supabase Edge Runtime background-task hook: keeps the isolate alive until
// the promise settles (the usage insert happens AFTER the response stream ends).
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function serviceHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  }
}

/** Best-effort usage insert — a failure must never break an already-served response. */
async function recordUsage(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  model: string,
  usage: TokenUsage
): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/usage_events`, {
      method: 'POST',
      headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        model,
        tokens_in: usage.tokensIn,
        tokens_out: usage.tokensOut,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`ai-proxy: usage insert failed (${res.status}): ${detail}`)
    }
  } catch (err) {
    console.error('ai-proxy: usage insert failed:', err)
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pathname = new URL(req.url).pathname
  const isModels = req.method === 'GET' && pathname.endsWith('/models')
  const isChat = req.method === 'POST' && pathname.endsWith('/chat/completions')
  if (!isModels && !isChat) {
    return json(404, openAiErrorBody('Not found.', 'invalid_request_error', 'not_found'))
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('ai-proxy: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY missing')
    return json(500, openAiErrorBody('NoteFlow AI is not configured.', 'server_error', 'not_configured'))
  }

  // ── Auth: resolve the caller's Supabase access token to a user id ──────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return json(
      401,
      openAiErrorBody('Missing NoteFlow session. Sign in from Settings → Account.', 'authentication_error', 'missing_token')
    )
  }
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  if (!userRes.ok) {
    return json(
      401,
      openAiErrorBody('Invalid or expired NoteFlow session. Sign in again from Settings → Account.', 'authentication_error', 'invalid_token')
    )
  }
  const user = (await userRes.json().catch(() => null)) as { id?: string } | null
  const userId = user?.id
  if (!userId) {
    return json(401, openAiErrorBody('Could not resolve the NoteFlow session.', 'authentication_error', 'invalid_token'))
  }

  // ── Entitlement: 'ai' or 'bundle' active (service role query, RLS bypassed,
  //    hence the explicit user_id filter) ──────────────────────────────────────
  const subsRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=product,status`,
    { headers: serviceHeaders(serviceRoleKey) }
  )
  if (!subsRes.ok) {
    console.error(`ai-proxy: subscriptions query failed (${subsRes.status})`)
    return json(500, openAiErrorBody('Could not check your subscription. Try again.', 'server_error', 'subscription_check_failed'))
  }
  if (!hasAiEntitlement(await subsRes.json().catch(() => null))) {
    return json(
      403,
      openAiErrorBody(
        'NoteFlow AI requires an active subscription. Manage your plan in Settings → Account.',
        'permission_error',
        'subscription_required'
      )
    )
  }

  const allowedModels = parseAllowedModels(Deno.env.get('AI_ALLOWED_MODELS'))
  if (isModels) return json(200, modelsListBody(allowedModels))

  // ── Monthly quota (checked BEFORE forwarding) ───────────────────────────────
  const limit = parseMonthlyTokens(Deno.env.get('AI_MONTHLY_TOKENS'))
  const usageRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_month_usage`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify({ p_user_id: userId }),
  })
  if (!usageRes.ok) {
    console.error(`ai-proxy: get_month_usage failed (${usageRes.status})`)
    return json(500, openAiErrorBody('Could not check your usage quota. Try again.', 'server_error', 'quota_check_failed'))
  }
  const used = Number(await usageRes.json().catch(() => 0)) || 0
  const quota = computeQuota(used, limit)
  const quotaHeaders = {
    'X-NoteFlow-Tokens-Used': String(used),
    'X-NoteFlow-Tokens-Limit': String(limit),
  }
  if (quota.exceeded) {
    return json(
      429,
      openAiErrorBody(
        'Your NoteFlow AI monthly quota is exceeded. It resets on the 1st of next month.',
        'quota_error',
        'monthly_quota_exceeded'
      ),
      quotaHeaders
    )
  }

  // ── Validate the request body and model ─────────────────────────────────────
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await req.json()
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return json(400, openAiErrorBody('Invalid JSON body.', 'invalid_request_error', 'invalid_body'), quotaHeaders)
  }
  if (!isModelAllowed(body.model, allowedModels)) {
    return json(
      400,
      openAiErrorBody(
        `Model "${String(body.model)}" is not available on NoteFlow AI. Available models: ${allowedModels.join(', ')}.`,
        'invalid_request_error',
        'model_not_allowed'
      ),
      quotaHeaders
    )
  }
  const model = String(body.model)

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!openrouterKey) {
    console.error('ai-proxy: OPENROUTER_API_KEY is not set')
    return json(500, openAiErrorBody('NoteFlow AI is not configured.', 'server_error', 'not_configured'))
  }

  // ── Forward to OpenRouter (usage.include added; rest of the body untouched) ─
  const upstream = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
      // Courtesy attribution headers (OpenRouter leaderboards/analytics).
      'HTTP-Referer': 'https://yagoid.github.io/noteflow',
      'X-Title': 'NoteFlow',
    },
    body: JSON.stringify(buildUpstreamBody(body)),
  })

  if (!upstream.ok) {
    // Pass the upstream error through — it is already OpenAI-shaped.
    const detail = await upstream.text().catch(() => '')
    return new Response(detail || JSON.stringify(openAiErrorBody('Upstream error.', 'server_error', 'upstream_error')), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        ...quotaHeaders,
      },
    })
  }

  // ── Non-streaming: read, meter, return ──────────────────────────────────────
  if (!body.stream) {
    const payload: unknown = await upstream.json().catch(() => null)
    if (payload === null) {
      return json(502, openAiErrorBody('Invalid upstream response.', 'server_error', 'upstream_error'), quotaHeaders)
    }
    const usage = extractUsageFromJson(payload)
    if (usage) await recordUsage(supabaseUrl, serviceRoleKey, userId, model, usage)
    else console.error('ai-proxy: upstream response carried no usage block (nothing metered)')
    return json(200, payload, quotaHeaders)
  }

  // ── Streaming: passthrough one branch of the tee, meter the other ───────────
  if (!upstream.body) {
    return json(502, openAiErrorBody('Upstream returned no stream.', 'server_error', 'upstream_error'), quotaHeaders)
  }
  const [clientBranch, meterBranch] = upstream.body.tee()

  const metering = (async () => {
    const scanner = createSseUsageScanner()
    const reader = meterBranch.getReader()
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        scanner.push(decoder.decode(value, { stream: true }))
      }
    } catch (err) {
      // Client aborted / upstream cut — meter whatever we saw so far.
      console.error('ai-proxy: metering stream error:', err)
    }
    const usage = scanner.end()
    if (usage) await recordUsage(supabaseUrl, serviceRoleKey, userId, model, usage)
    else console.error('ai-proxy: stream ended without a usage block (nothing metered)')
  })()
  // Keep the isolate alive until the insert lands (best-effort otherwise).
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) EdgeRuntime.waitUntil(metering)
  else metering.catch(() => {})

  return new Response(clientBranch, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...quotaHeaders,
    },
  })
})
