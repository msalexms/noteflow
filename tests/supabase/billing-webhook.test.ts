import { describe, it, expect } from 'vitest'
import {
  verifyWebhookSignature,
  parseVariantMap,
  mapLemonEvent,
  type Product,
} from '../../supabase/functions/billing-webhook/logic'

// Node >= 20 ships crypto.subtle globally, so the Web Crypto code under test
// runs unpolyfilled — same primitives the Deno Edge Function uses.

/** Computes the hex HMAC-SHA256 Lemon Squeezy would put in X-Signature. */
async function sign(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
}

describe('verifyWebhookSignature', () => {
  const body = '{"meta":{"event_name":"subscription_created"}}'
  const secret = 'test-signing-secret'

  it('accepts a valid signature', async () => {
    const signature = await sign(body, secret)
    await expect(verifyWebhookSignature(body, signature, secret)).resolves.toBe(true)
  })

  it('accepts an uppercase hex signature', async () => {
    const signature = (await sign(body, secret)).toUpperCase()
    await expect(verifyWebhookSignature(body, signature, secret)).resolves.toBe(true)
  })

  it('rejects a signature over a different body', async () => {
    const signature = await sign(body + ' ', secret)
    await expect(verifyWebhookSignature(body, signature, secret)).resolves.toBe(false)
  })

  it('rejects a signature made with another secret', async () => {
    const signature = await sign(body, 'wrong-secret')
    await expect(verifyWebhookSignature(body, signature, secret)).resolves.toBe(false)
  })

  it('rejects empty or non-hex signatures without throwing', async () => {
    await expect(verifyWebhookSignature(body, '', secret)).resolves.toBe(false)
    await expect(verifyWebhookSignature(body, 'not-hex!!', secret)).resolves.toBe(false)
    await expect(verifyWebhookSignature(body, 'abc', secret)).resolves.toBe(false) // odd length
  })

  it('rejects everything when the secret is empty', async () => {
    const signature = await sign(body, secret)
    await expect(verifyWebhookSignature(body, signature, '')).resolves.toBe(false)
  })
})

describe('parseVariantMap', () => {
  it('parses a full valid map', () => {
    const map = parseVariantMap('890123:ai,890124:cloud,890125:bundle')
    expect(map.get('890123')).toBe('ai')
    expect(map.get('890124')).toBe('cloud')
    expect(map.get('890125')).toBe('bundle')
    expect(map.size).toBe(3)
  })

  it('tolerates whitespace and empty segments', () => {
    const map = parseVariantMap(' 890123 : ai , 890124:cloud ,')
    expect(map.get('890123')).toBe('ai')
    expect(map.get('890124')).toBe('cloud')
    expect(map.size).toBe(2)
  })

  it('returns an empty map for an empty string', () => {
    expect(parseVariantMap('').size).toBe(0)
  })

  it('throws on an unknown product', () => {
    expect(() => parseVariantMap('890123:premium')).toThrow(/unknown product/i)
  })

  it('throws on corrupted entries', () => {
    expect(() => parseVariantMap('890123')).toThrow(/invalid variant map entry/i)
    expect(() => parseVariantMap('890123:')).toThrow(/invalid variant map entry/i)
    expect(() => parseVariantMap(':ai')).toThrow(/invalid variant map entry/i)
    expect(() => parseVariantMap('abc:ai')).toThrow(/invalid variant id/i)
  })
})

describe('mapLemonEvent', () => {
  const variantMap = new Map<string, Product>([
    ['890123', 'ai'],
    ['890124', 'cloud'],
    ['890125', 'bundle'],
  ])

  interface PayloadOverrides {
    dataType?: string
    status?: string
    variantId?: number | string
    renewsAt?: string | null
    endsAt?: string | null
    userId?: string
    withCustomData?: boolean
  }

  function payload(over: PayloadOverrides = {}) {
    return {
      meta: {
        event_name: 'subscription_created',
        ...(over.withCustomData === false
          ? {}
          : { custom_data: { user_id: over.userId ?? 'user-uuid-1' } }),
      },
      data: {
        type: over.dataType ?? 'subscriptions',
        id: '424242',
        attributes: {
          status: over.status ?? 'active',
          variant_id: over.variantId ?? 890123,
          renews_at: over.renewsAt === undefined ? '2026-08-06T10:00:00Z' : over.renewsAt,
          ends_at: over.endsAt === undefined ? null : over.endsAt,
          updated_at: '2026-07-06T10:00:00Z',
        },
      },
    }
  }

  it('maps subscription_created (active) to an apply row', () => {
    expect(mapLemonEvent(payload(), variantMap)).toEqual({
      kind: 'apply',
      row: {
        userId: 'user-uuid-1',
        product: 'ai',
        status: 'active',
        renewsAt: '2026-08-06T10:00:00Z',
        providerRef: '424242',
        eventAt: '2026-07-06T10:00:00Z',
      },
    })
  })

  it('keeps cancelled subscriptions active until ends_at', () => {
    const result = mapLemonEvent(
      payload({ status: 'cancelled', endsAt: '2026-08-01T00:00:00Z' }),
      variantMap
    )
    expect(result.kind).toBe('apply')
    if (result.kind !== 'apply') return
    expect(result.row.status).toBe('active')
    expect(result.row.renewsAt).toBe('2026-08-01T00:00:00Z') // ends_at wins over renews_at
  })

  it('maps expired to expired', () => {
    const result = mapLemonEvent(payload({ status: 'expired' }), variantMap)
    expect(result).toMatchObject({ kind: 'apply', row: { status: 'expired' } })
  })

  it('maps past_due, unpaid and paused to past_due', () => {
    for (const status of ['past_due', 'unpaid', 'paused']) {
      const result = mapLemonEvent(payload({ status }), variantMap)
      expect(result).toMatchObject({ kind: 'apply', row: { status: 'past_due' } })
    }
  })

  it('maps on_trial to active', () => {
    const result = mapLemonEvent(payload({ status: 'on_trial' }), variantMap)
    expect(result).toMatchObject({ kind: 'apply', row: { status: 'active' } })
  })

  it('ignores unknown subscription statuses', () => {
    const result = mapLemonEvent(payload({ status: 'something_new' }), variantMap)
    expect(result).toMatchObject({ kind: 'ignore' })
  })

  it('accepts variant_id as a string too', () => {
    const result = mapLemonEvent(payload({ variantId: '890124' }), variantMap)
    expect(result).toMatchObject({ kind: 'apply', row: { product: 'cloud' } })
  })

  it('ignores unknown variants with a telling reason', () => {
    const result = mapLemonEvent(payload({ variantId: 111111 }), variantMap)
    expect(result).toEqual({ kind: 'ignore', reason: 'unknown variant: 111111' })
  })

  it('ignores non-subscription objects (invoices, orders)', () => {
    expect(mapLemonEvent(payload({ dataType: 'subscription-invoices' }), variantMap)).toMatchObject(
      { kind: 'ignore' }
    )
    expect(mapLemonEvent(payload({ dataType: 'orders' }), variantMap)).toMatchObject({
      kind: 'ignore',
    })
  })

  it('yields userId null when custom_data is absent (purchase outside the app)', () => {
    const result = mapLemonEvent(payload({ withCustomData: false }), variantMap)
    expect(result).toMatchObject({ kind: 'apply', row: { userId: null } })
  })

  it('never throws on malformed payloads — returns ignore', () => {
    const malformed: unknown[] = [
      null,
      undefined,
      'a string',
      42,
      [],
      {},
      { data: null },
      { data: 'subscriptions' },
      { data: { type: 'subscriptions' } },
      { data: { type: 'subscriptions', id: '1', attributes: {} } },
      { data: { type: 'subscriptions', attributes: { variant_id: 890123, status: 'active' } } },
    ]
    for (const p of malformed) {
      expect(mapLemonEvent(p, variantMap).kind).toBe('ignore')
    }
  })

  it('falls back to renews_at null when neither ends_at nor renews_at exist', () => {
    const result = mapLemonEvent(payload({ renewsAt: null, endsAt: null }), variantMap)
    expect(result).toMatchObject({ kind: 'apply', row: { renewsAt: null } })
  })
})
