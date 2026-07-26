import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ALLOWED_MODELS,
  DEFAULT_MONTHLY_TOKENS,
  MODEL_QUOTA_MULTIPLIERS,
  parseAllowedModels,
  parseMonthlyTokens,
  isModelAllowed,
  hasAiEntitlement,
  computeQuota,
  quotaMultiplierFor,
  computeQuotaTokens,
  openAiErrorBody,
  modelsListBody,
  buildUpstreamBody,
  extractUsageFromJson,
  createSseUsageScanner,
} from '../../supabase/functions/ai-proxy/logic'

describe('parseAllowedModels', () => {
  it('falls back to the curated defaults when the env is missing or empty', () => {
    expect(parseAllowedModels(undefined)).toEqual([...DEFAULT_ALLOWED_MODELS])
    expect(parseAllowedModels(null)).toEqual([...DEFAULT_ALLOWED_MODELS])
    expect(parseAllowedModels('')).toEqual([...DEFAULT_ALLOWED_MODELS])
    expect(parseAllowedModels('  ,  ,')).toEqual([...DEFAULT_ALLOWED_MODELS])
  })

  it('parses a comma-separated override with whitespace tolerance', () => {
    expect(parseAllowedModels(' openai/gpt-5.6-luna , x-ai/grok-4.5 ,')).toEqual([
      'openai/gpt-5.6-luna',
      'x-ai/grok-4.5',
    ])
  })

  it('returns a copy, never the shared default array', () => {
    const a = parseAllowedModels(undefined)
    a.push('mutated')
    expect(DEFAULT_ALLOWED_MODELS).not.toContain('mutated')
  })
})

describe('parseMonthlyTokens', () => {
  it('parses a positive integer', () => {
    expect(parseMonthlyTokens('5000000')).toBe(5_000_000)
  })

  it('falls back to the default on missing/garbage/non-positive values', () => {
    expect(parseMonthlyTokens(undefined)).toBe(DEFAULT_MONTHLY_TOKENS)
    expect(parseMonthlyTokens(null)).toBe(DEFAULT_MONTHLY_TOKENS)
    expect(parseMonthlyTokens('')).toBe(DEFAULT_MONTHLY_TOKENS)
    expect(parseMonthlyTokens('lots')).toBe(DEFAULT_MONTHLY_TOKENS)
    expect(parseMonthlyTokens('0')).toBe(DEFAULT_MONTHLY_TOKENS)
    expect(parseMonthlyTokens('-5')).toBe(DEFAULT_MONTHLY_TOKENS)
    expect(parseMonthlyTokens('1.5')).toBe(DEFAULT_MONTHLY_TOKENS)
  })
})

describe('isModelAllowed', () => {
  const allowed = ['openai/gpt-5.6-luna', 'x-ai/grok-4.5']

  it('accepts exact matches only', () => {
    expect(isModelAllowed('openai/gpt-5.6-luna', allowed)).toBe(true)
    expect(isModelAllowed('openai/gpt-5.6', allowed)).toBe(false)
    expect(isModelAllowed('OPENAI/GPT-5.6-LUNA-PRO', allowed)).toBe(false)
  })

  it('rejects non-string models without throwing', () => {
    expect(isModelAllowed(undefined, allowed)).toBe(false)
    expect(isModelAllowed(42, allowed)).toBe(false)
    expect(isModelAllowed({ model: 'openai/gpt-5.6-luna' }, allowed)).toBe(false)
  })
})

describe('hasAiEntitlement', () => {
  it("grants with an active 'ai' or 'bundle' row", () => {
    expect(hasAiEntitlement([{ product: 'ai', status: 'active' }])).toBe(true)
    expect(hasAiEntitlement([{ product: 'bundle', status: 'active' }])).toBe(true)
    expect(
      hasAiEntitlement([
        { product: 'cloud', status: 'active' },
        { product: 'ai', status: 'active' },
      ])
    ).toBe(true)
  })

  it("denies 'cloud'-only, inactive statuses and empty sets", () => {
    expect(hasAiEntitlement([])).toBe(false)
    expect(hasAiEntitlement([{ product: 'cloud', status: 'active' }])).toBe(false)
    expect(hasAiEntitlement([{ product: 'ai', status: 'past_due' }])).toBe(false)
    expect(hasAiEntitlement([{ product: 'ai', status: 'expired' }])).toBe(false)
  })

  it('never throws on malformed input', () => {
    expect(hasAiEntitlement(null)).toBe(false)
    expect(hasAiEntitlement(undefined)).toBe(false)
    expect(hasAiEntitlement('rows')).toBe(false)
    expect(hasAiEntitlement([null, 'x', 42, {}])).toBe(false)
  })
})

describe('computeQuota', () => {
  it('reports remaining tokens below the limit', () => {
    expect(computeQuota(1_000, 3_000_000)).toEqual({ exceeded: false, remaining: 2_999_000 })
    expect(computeQuota(0, 100)).toEqual({ exceeded: false, remaining: 100 })
  })

  it('flags exceeded at and beyond the limit, clamping remaining at 0', () => {
    expect(computeQuota(100, 100)).toEqual({ exceeded: true, remaining: 0 })
    expect(computeQuota(150, 100)).toEqual({ exceeded: true, remaining: 0 })
  })

  it('treats negative/NaN usage as zero', () => {
    expect(computeQuota(-5, 100)).toEqual({ exceeded: false, remaining: 100 })
    expect(computeQuota(NaN, 100)).toEqual({ exceeded: false, remaining: 100 })
  })
})

describe('quotaMultiplierFor', () => {
  it('returns the map value for advanced (×6) models', () => {
    expect(quotaMultiplierFor('moonshotai/kimi-k3')).toBe(6)
  })

  it('returns the map value for mid-tier (×2) models', () => {
    expect(quotaMultiplierFor('x-ai/grok-4.5')).toBe(2)
  })

  it('returns 1 for standard curated models (not in the map)', () => {
    expect(quotaMultiplierFor('openai/gpt-5.6-luna')).toBe(1)
    expect(quotaMultiplierFor('deepseek/deepseek-v4-flash')).toBe(1)
    expect(quotaMultiplierFor('xiaomi/mimo-v2.5-pro')).toBe(1)
  })

  it('returns 1 for unknown models', () => {
    expect(quotaMultiplierFor('someone/some-model')).toBe(1)
    expect(quotaMultiplierFor('')).toBe(1)
  })

  it('every multiplied model is part of the curated catalog', () => {
    for (const model of Object.keys(MODEL_QUOTA_MULTIPLIERS)) {
      expect(DEFAULT_ALLOWED_MODELS).toContain(model)
    }
  })
})

describe('computeQuotaTokens', () => {
  it('sums in+out unweighted for standard models', () => {
    expect(computeQuotaTokens({ tokensIn: 120, tokensOut: 45 }, 'openai/gpt-5.6-luna')).toBe(165)
  })

  it('applies the ×2 multiplier for mid-tier models', () => {
    expect(computeQuotaTokens({ tokensIn: 100, tokensOut: 50 }, 'x-ai/grok-4.5')).toBe(300)
  })

  it('applies the ×6 multiplier for advanced models', () => {
    expect(computeQuotaTokens({ tokensIn: 100, tokensOut: 50 }, 'moonshotai/kimi-k3')).toBe(900)
  })

  it('always yields an integer (round contract; current multipliers are integral)', () => {
    expect(Number.isInteger(computeQuotaTokens({ tokensIn: 7, tokensOut: 3 }, 'moonshotai/kimi-k3'))).toBe(true)
    expect(Number.isInteger(computeQuotaTokens({ tokensIn: 1, tokensOut: 2 }, 'anthropic/claude-haiku-4.5'))).toBe(true)
  })

  it('treats zero and malformed usage sides as 0', () => {
    expect(computeQuotaTokens({ tokensIn: 0, tokensOut: 0 }, 'moonshotai/kimi-k3')).toBe(0)
    expect(computeQuotaTokens({ tokensIn: NaN, tokensOut: 10 }, 'moonshotai/kimi-k3')).toBe(60)
    expect(computeQuotaTokens({ tokensIn: NaN, tokensOut: 10 }, 'x-ai/grok-4.5')).toBe(20)
    expect(computeQuotaTokens({ tokensIn: -5, tokensOut: 10 }, 'openai/gpt-5.6-luna')).toBe(10)
  })
})

describe('openAiErrorBody / modelsListBody', () => {
  it('shapes an OpenAI-compatible error', () => {
    expect(openAiErrorBody('nope', 'permission_error', 'subscription_required')).toEqual({
      error: { message: 'nope', type: 'permission_error', code: 'subscription_required' },
    })
  })

  it('shapes the OpenAI models list', () => {
    expect(modelsListBody(['a/b', 'c/d'])).toEqual({
      object: 'list',
      data: [
        { id: 'a/b', object: 'model' },
        { id: 'c/d', object: 'model' },
      ],
    })
  })
})

describe('buildUpstreamBody', () => {
  it('injects usage.include without touching the rest of the body', () => {
    const body = { model: 'openai/gpt-5.6-luna', messages: [{ role: 'user', content: 'hi' }], stream: true }
    expect(buildUpstreamBody(body)).toEqual({ ...body, usage: { include: true } })
    // Original object untouched.
    expect('usage' in body).toBe(false)
  })

  it('strips the OpenRouter routing/extra-cost fields (allowlist bypass vectors)', () => {
    const body = {
      model: 'openai/gpt-5.6-luna',
      messages: [{ role: 'user', content: 'hi' }],
      // Fallback routing: would execute non-allowlisted (expensive) models.
      models: ['anthropic/claude-opus-4', 'openai/o3'],
      route: 'fallback',
      // Provider routing preferences and paid plugins on the operator's key.
      provider: { order: ['OpenAI'], allow_fallbacks: true },
      plugins: [{ id: 'web' }],
    }
    const upstream = buildUpstreamBody(body)
    expect(upstream).not.toHaveProperty('models')
    expect(upstream).not.toHaveProperty('route')
    expect(upstream).not.toHaveProperty('provider')
    expect(upstream).not.toHaveProperty('plugins')
    // Legitimate fields still pass through, usage.include is added.
    expect(upstream).toEqual({
      model: 'openai/gpt-5.6-luna',
      messages: [{ role: 'user', content: 'hi' }],
      usage: { include: true },
    })
    // Original client object untouched.
    expect(body.models).toEqual(['anthropic/claude-opus-4', 'openai/o3'])
    expect(body.route).toBe('fallback')
  })

  it('passes other OpenAI fields (tools, temperature, max_tokens…) through untouched', () => {
    const body = {
      model: 'openai/gpt-5.6-luna',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      max_tokens: 4096,
      temperature: 0.7,
      tools: [{ type: 'function', function: { name: 'create_note', parameters: {} } }],
      tool_choice: 'auto',
    }
    expect(buildUpstreamBody(body)).toEqual({ ...body, usage: { include: true } })
  })
})

describe('extractUsageFromJson', () => {
  it('reads prompt/completion tokens', () => {
    expect(
      extractUsageFromJson({ id: 'x', usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 } })
    ).toEqual({ tokensIn: 120, tokensOut: 45 })
  })

  it('defaults a missing side to 0 when the other is present', () => {
    expect(extractUsageFromJson({ usage: { prompt_tokens: 10 } })).toEqual({ tokensIn: 10, tokensOut: 0 })
    expect(extractUsageFromJson({ usage: { completion_tokens: 7 } })).toEqual({ tokensIn: 0, tokensOut: 7 })
  })

  it('returns null when there is no usable usage block', () => {
    expect(extractUsageFromJson(null)).toBeNull()
    expect(extractUsageFromJson('x')).toBeNull()
    expect(extractUsageFromJson({})).toBeNull()
    expect(extractUsageFromJson({ usage: null })).toBeNull()
    expect(extractUsageFromJson({ usage: {} })).toBeNull()
    expect(extractUsageFromJson({ usage: { prompt_tokens: 'many' } })).toBeNull()
  })
})

describe('createSseUsageScanner', () => {
  const chunk = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`

  it('captures the usage block from the final SSE chunk', () => {
    const scanner = createSseUsageScanner()
    scanner.push(chunk({ choices: [{ delta: { content: 'Hel' } }] }))
    scanner.push(chunk({ choices: [{ delta: { content: 'lo' } }] }))
    scanner.push(chunk({ choices: [{ delta: {} }], usage: { prompt_tokens: 30, completion_tokens: 12 } }))
    scanner.push('data: [DONE]\n\n')
    expect(scanner.end()).toEqual({ tokensIn: 30, tokensOut: 12 })
  })

  it('handles data lines split across pushes', () => {
    const full = chunk({ usage: { prompt_tokens: 5, completion_tokens: 3 } })
    const scanner = createSseUsageScanner()
    scanner.push(full.slice(0, 18))
    scanner.push(full.slice(18))
    expect(scanner.end()).toEqual({ tokensIn: 5, tokensOut: 3 })
  })

  it('flushes a trailing line without a final newline', () => {
    const scanner = createSseUsageScanner()
    scanner.push(`data: ${JSON.stringify({ usage: { prompt_tokens: 2, completion_tokens: 1 } })}`)
    expect(scanner.end()).toEqual({ tokensIn: 2, tokensOut: 1 })
  })

  it('keeps the LAST usage block when several appear', () => {
    const scanner = createSseUsageScanner()
    scanner.push(chunk({ usage: { prompt_tokens: 1, completion_tokens: 1 } }))
    scanner.push(chunk({ usage: { prompt_tokens: 9, completion_tokens: 4 } }))
    expect(scanner.end()).toEqual({ tokensIn: 9, tokensOut: 4 })
  })

  it('ignores keepalives, comments and malformed frames', () => {
    const scanner = createSseUsageScanner()
    scanner.push(': keepalive\n\n')
    scanner.push('data: {broken json\n')
    scanner.push('event: ping\n')
    expect(scanner.end()).toBeNull()
  })
})
