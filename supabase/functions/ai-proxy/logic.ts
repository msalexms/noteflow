// Pure, runtime-agnostic logic for the NoteFlow AI proxy (managed LLM plan).
// Deliberately uses ONLY standard Web/JS APIs — no Deno.* — so it runs
// unchanged in the Edge Function (Deno) and under vitest on Node. Covered by
// tests/supabase/ai-proxy.test.ts. Same philosophy as billing-webhook/logic.ts.

/**
 * Curated OpenRouter model ids the managed plan serves by default (overridable
 * with the AI_ALLOWED_MODELS env). All of them MUST support tool calling — the
 * NoteFlow chat is agentic. NOT all of them support vision: the two DeepSeek
 * models and Xiaomi MiMo are text-only (every other curated model accepts image
 * input).
 *
 * KEEP IN SYNC with NOTEFLOW_AI_MODELS in electron/ai/llm/presets.ts (the
 * `noteflow` preset shows this same list as suggested models in the client,
 * and NOTEFLOW_AI_MODEL_META mirrors the multipliers/vision flags below).
 */
export const DEFAULT_ALLOWED_MODELS: readonly string[] = [
  // Standard models (×1 quota).
  'deepseek/deepseek-v4-pro',
  'deepseek/deepseek-v4-flash',
  'xiaomi/mimo-v2.5-pro',
  'openai/gpt-5.6-luna',
  'anthropic/claude-haiku-4.5',
  // Mid-tier (×2 quota — see MODEL_QUOTA_MULTIPLIERS).
  'x-ai/grok-4.5',
  // Advanced models (×6 quota — see MODEL_QUOTA_MULTIPLIERS).
  'moonshotai/kimi-k3',
]

/** Default monthly QUOTA token budget (weighted input + output) per user. */
export const DEFAULT_MONTHLY_TOKENS = 3_000_000

/**
 * Per-model quota multipliers: what a real token costs against the monthly
 * quota. Only models more expensive than the ×1 baseline are listed — anything
 * not in the map (every standard model, and unknown ids) is ×1. There are two
 * paid tiers today, mid-tier ×2 and advanced ×6, but nothing here assumes a
 * fixed set of values: quotaMultiplierFor accepts any positive finite number,
 * so adding a tier is just a new entry. Real tokens (tokens_in/tokens_out) are
 * still recorded unweighted for the operator's cost accounting; the weighted
 * value goes to the usage_events.quota_tokens column (migration 0007).
 *
 * KEEP IN SYNC with NOTEFLOW_AI_MODEL_META in electron/ai/llm/presets.ts.
 */
export const MODEL_QUOTA_MULTIPLIERS: Readonly<Record<string, number>> = {
  'x-ai/grok-4.5': 2,
  'moonshotai/kimi-k3': 6,
}

/** Quota multiplier for a model — unknown/unlisted models cost the ×1 baseline. */
export function quotaMultiplierFor(model: string): number {
  const mult = MODEL_QUOTA_MULTIPLIERS[model]
  return typeof mult === 'number' && Number.isFinite(mult) && mult > 0 ? mult : 1
}

/**
 * Weighted quota tokens a usage event costs: round((in + out) * multiplier).
 * Defensive: a malformed usage side counts as 0 rather than poisoning the sum.
 */
export function computeQuotaTokens(usage: TokenUsage, model: string): number {
  const tokensIn = Number.isFinite(usage.tokensIn) && usage.tokensIn > 0 ? usage.tokensIn : 0
  const tokensOut = Number.isFinite(usage.tokensOut) && usage.tokensOut > 0 ? usage.tokensOut : 0
  return Math.round((tokensIn + tokensOut) * quotaMultiplierFor(model))
}

/**
 * Parses the AI_ALLOWED_MODELS env value ("a/b,c/d" → list). Empty/missing/
 * whitespace-only input falls back to the curated default list.
 */
export function parseAllowedModels(raw: string | undefined | null): string[] {
  const models = (raw ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  return models.length > 0 ? models : [...DEFAULT_ALLOWED_MODELS]
}

/**
 * Parses the AI_MONTHLY_TOKENS env value. Anything that is not a positive
 * integer falls back to DEFAULT_MONTHLY_TOKENS (operator typo must not turn
 * the quota off or into NaN-land).
 */
export function parseMonthlyTokens(raw: string | undefined | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return DEFAULT_MONTHLY_TOKENS
  return n
}

export function isModelAllowed(model: unknown, allowed: string[]): boolean {
  return typeof model === 'string' && allowed.includes(model)
}

/**
 * True when the user's subscription rows grant the managed AI plan: some row
 * with product 'ai' or 'bundle' and status 'active'. Same rule as
 * computeEntitlements in electron/entitlements.ts — keep both in sync.
 * Defensive: malformed rows never throw, they just grant nothing.
 */
export function hasAiEntitlement(rows: unknown): boolean {
  if (!Array.isArray(rows)) return false
  return rows.some(
    (row) =>
      row !== null &&
      typeof row === 'object' &&
      (row as Record<string, unknown>).status === 'active' &&
      ((row as Record<string, unknown>).product === 'ai' ||
        (row as Record<string, unknown>).product === 'bundle')
  )
}

export interface QuotaState {
  exceeded: boolean
  /** Tokens still available this month (never negative). */
  remaining: number
}

/** used = tokens already consumed this month (from get_month_usage). */
export function computeQuota(used: number, limit: number): QuotaState {
  const safeUsed = Number.isFinite(used) && used > 0 ? used : 0
  return { exceeded: safeUsed >= limit, remaining: Math.max(0, limit - safeUsed) }
}

/** OpenAI-compatible error body, so any OpenAI client surfaces it nicely. */
export function openAiErrorBody(
  message: string,
  type: string,
  code: string
): { error: { message: string; type: string; code: string } } {
  return { error: { message, type, code } }
}

/** GET /models response in OpenAI list format. */
export function modelsListBody(models: string[]): {
  object: 'list'
  data: Array<{ id: string; object: 'model' }>
} {
  return { object: 'list', data: models.map((id) => ({ id, object: 'model' as const })) }
}

/**
 * OpenRouter routing/feature fields the proxy strips before forwarding. The
 * allowlist only validates `model`, so these would let a subscriber run up the
 * operator's bill outside the curated list:
 *   - models + route: alternate-model fallback routing — a permitted `model`
 *     plus `models: [<expensive ids>]` can force execution of models OUTSIDE
 *     the allowlist (e.g. by overflowing the primary model's context so the
 *     fallback kicks in), and the quota is token-based, not cost-based.
 *   - provider: upstream-provider routing preferences (price/order overrides).
 *   - plugins: extra-cost features (e.g. web search) billed on top of tokens.
 */
const STRIPPED_UPSTREAM_FIELDS = ['models', 'route', 'provider', 'plugins'] as const

/**
 * Prepares the body forwarded to OpenRouter: the client body minus the
 * routing/feature fields above (cost control — see STRIPPED_UPSTREAM_FIELDS),
 * plus `usage: { include: true }` — an OpenRouter extension that appends the
 * token `usage` block to the last SSE chunk (and to non-stream responses), so
 * the proxy can meter without re-tokenizing anything. Everything else passes
 * through untouched.
 */
export function buildUpstreamBody(clientBody: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = { ...clientBody, usage: { include: true } }
  for (const field of STRIPPED_UPSTREAM_FIELDS) delete body[field]
  return body
}

export interface TokenUsage {
  tokensIn: number
  tokensOut: number
}

/**
 * Extracts the usage block from a parsed OpenAI-compatible response/chunk
 * ({ usage: { prompt_tokens, completion_tokens } }). Returns null when absent
 * or malformed.
 */
export function extractUsageFromJson(payload: unknown): TokenUsage | null {
  if (payload === null || typeof payload !== 'object') return null
  const usage = (payload as Record<string, unknown>).usage
  if (usage === null || typeof usage !== 'object') return null
  const u = usage as Record<string, unknown>
  const tokensIn = typeof u.prompt_tokens === 'number' && Number.isFinite(u.prompt_tokens) ? u.prompt_tokens : null
  const tokensOut = typeof u.completion_tokens === 'number' && Number.isFinite(u.completion_tokens) ? u.completion_tokens : null
  if (tokensIn === null && tokensOut === null) return null
  return { tokensIn: tokensIn ?? 0, tokensOut: tokensOut ?? 0 }
}

export interface SseUsageScanner {
  /** Feed decoded stream text (any chunking — lines may split across pushes). */
  push(text: string): void
  /** Flush the tail and return the LAST usage block seen (OpenRouter puts it in the final chunk). */
  end(): TokenUsage | null
}

/**
 * Incremental scanner for the teed SSE stream: parses each `data:` line and
 * remembers the last `usage` block. O(line) memory — the proxy never buffers
 * the whole response. Keepalives / partial frames / [DONE] are ignored.
 */
export function createSseUsageScanner(): SseUsageScanner {
  let buf = ''
  let found: TokenUsage | null = null

  const scanLine = (line: string): void => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    try {
      const usage = extractUsageFromJson(JSON.parse(data))
      if (usage) found = usage
    } catch {
      // comment/keepalive/partial frame — ignore
    }
  }

  return {
    push(text: string): void {
      buf += text
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        scanLine(buf.slice(0, nl).trim())
        buf = buf.slice(nl + 1)
      }
    },
    end(): TokenUsage | null {
      const tail = buf.trim()
      buf = ''
      if (tail) scanLine(tail)
      return found
    },
  }
}
