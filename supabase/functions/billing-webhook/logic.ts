// Pure, runtime-agnostic logic for the Lemon Squeezy billing webhook.
// Deliberately uses ONLY standard Web APIs (crypto.subtle, TextEncoder) — no
// Deno.* — so it runs unchanged in the Edge Function (Deno) and under vitest
// on Node (>=20 ships crypto.subtle globally). Covered by
// tests/supabase/billing-webhook.test.ts.

export type Product = 'ai' | 'cloud' | 'bundle'

/**
 * Statuses we write to public.subscriptions. Note we never emit 'canceled':
 * a Lemon Squeezy `cancelled` subscription stays paid until its ends_at, so we
 * keep status 'active' (grace periods are resolved server-side — see the
 * comment in electron/entitlements.ts) and rely on the later
 * subscription_expired event to flip it to 'expired'.
 */
export type SubscriptionStatus = 'active' | 'past_due' | 'expired'

export interface SubscriptionEventRow {
  /** null when the checkout did not carry custom_data.user_id (update-only path). */
  userId: string | null
  product: Product
  status: SubscriptionStatus
  /** ISO timestamp the entitlement runs until (LS ends_at, else renews_at). */
  renewsAt: string | null
  /** Lemon Squeezy subscription id — our idempotency key (provider_ref). */
  providerRef: string
  /** ISO timestamp of the event (LS attributes.updated_at) — out-of-order guard. */
  eventAt: string
}

export type MapResult =
  | { kind: 'apply'; row: SubscriptionEventRow }
  | { kind: 'ignore'; reason: string }

const VALID_PRODUCTS: ReadonlySet<string> = new Set(['ai', 'cloud', 'bundle'])

/** Lemon Squeezy subscription status → our subscriptions.status. */
const STATUS_MAP: Readonly<Record<string, SubscriptionStatus>> = {
  on_trial: 'active',
  active: 'active',
  // Still paid until ends_at; LS emits subscription_expired when it lapses.
  cancelled: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  paused: 'past_due',
  expired: 'expired',
}

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase()
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) return null
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Verifies the `X-Signature` header Lemon Squeezy sends with every webhook:
 * hex-encoded HMAC-SHA256 of the RAW request body with the signing secret.
 * Delegates the comparison to crypto.subtle.verify, which is constant-time.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHex: string,
  secret: string
): Promise<boolean> {
  if (!secret || !signatureHex) return false
  const signature = hexToBytes(signatureHex)
  if (!signature) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  return crypto.subtle.verify('HMAC', key, signature as BufferSource, encoder.encode(rawBody))
}

/**
 * Parses the LEMONSQUEEZY_VARIANT_MAP env value, e.g.
 * "890123:ai,890124:cloud,890125:bundle" → Map variantId → product.
 * THROWS on any malformed entry or unknown product: this is operator-written
 * config, and failing loudly (webhook answers 500, LS retries) beats silently
 * dropping a mistyped variant and never granting paid entitlements.
 */
export function parseVariantMap(raw: string): Map<string, Product> {
  const map = new Map<string, Product>()
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue // tolerate trailing/double commas
    const sep = trimmed.indexOf(':')
    if (sep <= 0 || sep === trimmed.length - 1) {
      throw new Error(`Invalid variant map entry: "${trimmed}" (expected "<variantId>:<product>")`)
    }
    const variantId = trimmed.slice(0, sep).trim()
    const product = trimmed.slice(sep + 1).trim()
    if (!/^\d+$/.test(variantId)) {
      throw new Error(`Invalid variant id in variant map entry: "${trimmed}"`)
    }
    if (!VALID_PRODUCTS.has(product)) {
      throw new Error(`Unknown product "${product}" in variant map entry: "${trimmed}"`)
    }
    map.set(variantId, product as Product)
  }
  return map
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/**
 * Maps a (signature-verified) Lemon Squeezy webhook payload to the row we feed
 * apply_subscription_event, or to an ignore with a human-readable reason.
 * Fully defensive: malformed/unexpected shapes NEVER throw — they map to
 * ignore, the endpoint answers 200 and LS does not enter a retry loop.
 */
export function mapLemonEvent(payload: unknown, variantMap: Map<string, Product>): MapResult {
  if (!isRecord(payload)) return { kind: 'ignore', reason: 'malformed payload: not an object' }

  const data = payload.data
  if (!isRecord(data)) return { kind: 'ignore', reason: 'malformed payload: missing data' }

  // Only subscription objects mutate entitlements. subscription_payment_*
  // events carry data.type 'subscription-invoices' and order_* events carry
  // 'orders' — both are informational for us.
  if (data.type !== 'subscriptions') {
    return { kind: 'ignore', reason: `unsupported data.type: ${String(data.type)}` }
  }

  const attributes = data.attributes
  if (!isRecord(attributes)) {
    return { kind: 'ignore', reason: 'malformed payload: missing data.attributes' }
  }

  const providerRef = asNonEmptyString(data.id)
  if (!providerRef) return { kind: 'ignore', reason: 'malformed payload: missing data.id' }

  const variantId = asNonEmptyString(attributes.variant_id)
  if (!variantId) return { kind: 'ignore', reason: 'malformed payload: missing variant_id' }

  const product = variantMap.get(variantId)
  if (!product) return { kind: 'ignore', reason: `unknown variant: ${variantId}` }

  const lsStatus = typeof attributes.status === 'string' ? attributes.status : ''
  const status = STATUS_MAP[lsStatus]
  if (!status) return { kind: 'ignore', reason: `unknown subscription status: ${lsStatus || '(missing)'}` }

  const eventAt = asNonEmptyString(attributes.updated_at)
  if (!eventAt) return { kind: 'ignore', reason: 'malformed payload: missing updated_at' }

  // ends_at is set once the subscription is cancelled/expiring and marks the
  // real end of the paid period; otherwise renews_at is the next renewal.
  const renewsAt =
    asNonEmptyString(attributes.ends_at) ?? asNonEmptyString(attributes.renews_at)

  // The app opens the checkout with checkout[custom][user_id]=<uuid>, which LS
  // echoes back in meta.custom_data. Purchases made outside the app lack it →
  // userId null → apply_subscription_event only updates, never inserts.
  const meta = payload.meta
  const customData = isRecord(meta) ? meta.custom_data : undefined
  const rawUserId = isRecord(customData) ? customData.user_id : undefined
  const userId = typeof rawUserId === 'string' && rawUserId.trim() !== '' ? rawUserId : null

  return {
    kind: 'apply',
    row: { userId, product, status, renewsAt, providerRef, eventAt },
  }
}
