import { describe, it, expect } from 'vitest'
import { computeEntitlements, type SubscriptionRow } from '../../electron/entitlements'

function row(product: string, status: string): SubscriptionRow {
  return { product, status, renews_at: null }
}

describe('computeEntitlements', () => {
  it('grants nothing for no rows', () => {
    expect(computeEntitlements([])).toEqual({ ai: false, cloud: false })
    expect(computeEntitlements(null)).toEqual({ ai: false, cloud: false })
    expect(computeEntitlements(undefined)).toEqual({ ai: false, cloud: false })
  })

  it('grants a single active product without the other', () => {
    expect(computeEntitlements([row('ai', 'active')])).toEqual({ ai: true, cloud: false })
    expect(computeEntitlements([row('cloud', 'active')])).toEqual({ ai: false, cloud: true })
  })

  it('an active bundle covers both products', () => {
    expect(computeEntitlements([row('bundle', 'active')])).toEqual({ ai: true, cloud: true })
  })

  it('non-active statuses grant nothing', () => {
    expect(computeEntitlements([row('ai', 'past_due')])).toEqual({ ai: false, cloud: false })
    expect(computeEntitlements([row('cloud', 'canceled')])).toEqual({ ai: false, cloud: false })
    expect(computeEntitlements([row('bundle', 'expired')])).toEqual({ ai: false, cloud: false })
  })

  it('an expired row does not mask an active one for the same product', () => {
    expect(computeEntitlements([row('ai', 'expired'), row('ai', 'active')])).toEqual({
      ai: true,
      cloud: false,
    })
  })

  it('combines independent product rows', () => {
    expect(computeEntitlements([row('ai', 'active'), row('cloud', 'active')])).toEqual({
      ai: true,
      cloud: true,
    })
  })

  it('ignores unknown products and malformed rows', () => {
    expect(
      computeEntitlements([
        row('something-else', 'active'),
        null as unknown as SubscriptionRow,
        row('ai', 'active'),
      ])
    ).toEqual({ ai: true, cloud: false })
  })
})
