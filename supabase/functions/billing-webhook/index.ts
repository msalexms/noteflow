// Supabase Edge Function: Lemon Squeezy billing webhook.
// Zero external dependencies (fetch + Web Crypto only — same philosophy as
// electron/account.ts). All testable logic lives in ./logic.ts; this file is
// just the Deno glue: env, HTTP plumbing and the PostgREST RPC call.
//
// Deploy with --no-verify-jwt: Lemon Squeezy calls us without a Supabase JWT;
// authentication is the HMAC signature check below.
//
// Env (set via `supabase secrets set`, except the SUPABASE_* ones which the
// platform injects automatically):
//   LEMONSQUEEZY_WEBHOOK_SECRET  signing secret of the LS webhook
//   LEMONSQUEEZY_VARIANT_MAP     "890123:ai,890124:cloud,890125:bundle"
//   SUPABASE_URL                 injected
//   SUPABASE_SERVICE_ROLE_KEY    injected

import { verifyWebhookSignature, parseVariantMap, mapLemonEvent } from './logic.ts'

// Minimal surface of the Deno global we use (this file is deployed to Deno;
// it is excluded from the repo's tsc builds, which know nothing about Deno).
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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  const secret = Deno.env.get('LEMONSQUEEZY_WEBHOOK_SECRET')
  if (!secret) {
    console.error('billing-webhook: LEMONSQUEEZY_WEBHOOK_SECRET is not set')
    return json(500, { error: 'webhook not configured' })
  }

  // The signature covers the RAW body — read it as text, never as parsed JSON.
  const rawBody = await req.text()
  const signature = req.headers.get('X-Signature') ?? ''
  if (!(await verifyWebhookSignature(rawBody, signature, secret))) {
    return json(401, { error: 'invalid signature' })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    // Signed but unparseable — should never happen coming from LS.
    return json(400, { error: 'invalid JSON body' })
  }

  const variantMapRaw = Deno.env.get('LEMONSQUEEZY_VARIANT_MAP')
  if (!variantMapRaw) {
    console.error('billing-webhook: LEMONSQUEEZY_VARIANT_MAP is not set')
    return json(500, { error: 'webhook not configured' })
  }
  let variantMap
  try {
    variantMap = parseVariantMap(variantMapRaw)
  } catch (err) {
    console.error('billing-webhook: invalid LEMONSQUEEZY_VARIANT_MAP:', err)
    return json(500, { error: 'webhook not configured' })
  }

  const result = mapLemonEvent(payload, variantMap)
  if (result.kind === 'ignore') {
    // 200 on purpose: a non-2xx would put Lemon Squeezy in a retry loop over
    // an event we will never process. Unknown variants are logged so a
    // misconfigured variant map does not fail silently.
    if (result.reason.startsWith('unknown variant')) {
      console.warn(`billing-webhook: ignoring event (${result.reason}) — check LEMONSQUEEZY_VARIANT_MAP`)
    }
    return json(200, { ignored: result.reason })
  }

  const { row } = result
  if (row.userId === null) {
    // Update-only path: without custom_data.user_id (purchase not initiated
    // from the app) a first-time event cannot be attributed to any account.
    console.warn(
      `billing-webhook: event for subscription ${row.providerRef} has no custom_data.user_id; ` +
        'it will only apply if the subscription row already exists'
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('billing-webhook: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
    return json(500, { error: 'webhook not configured' })
  }

  const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/apply_subscription_event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      p_user_id: row.userId,
      p_product: row.product,
      p_status: row.status,
      p_renews_at: row.renewsAt,
      p_provider: 'lemonsqueezy',
      p_provider_ref: row.providerRef,
      p_event_at: row.eventAt,
    }),
  })

  if (!rpc.ok) {
    const detail = await rpc.text().catch(() => '')
    console.error(`billing-webhook: apply_subscription_event failed (${rpc.status}): ${detail}`)
    // 500 → Lemon Squeezy retries the delivery later.
    return json(500, { error: 'failed to apply event' })
  }

  return json(200, { ok: true })
})
