// The curated catalog of the managed NoteFlow AI plan is DUPLICATED on purpose:
//   - client: NOTEFLOW_AI_MODELS + NOTEFLOW_AI_MODEL_META (electron/ai/llm/presets.ts)
//   - proxy:  DEFAULT_ALLOWED_MODELS + MODEL_QUOTA_MULTIPLIERS (ai-proxy/logic.ts)
// The proxy can't import from electron/ (it runs on Deno) and the client can't import
// from the Edge Function, so the only thing keeping them in sync are "KEEP IN SYNC"
// comments. The catalog rotates, so this file turns those comments into an invariant.
// Note the client meta lists EVERY model (the picker needs the ×1 ones too) while the
// proxy map lists only the models above the ×1 baseline — that asymmetry is the point
// of checking both directions.
import { describe, it, expect } from 'vitest'
import { NOTEFLOW_AI_MODELS, NOTEFLOW_AI_MODEL_META } from '../../electron/ai/llm/presets'
import { DEFAULT_ALLOWED_MODELS, MODEL_QUOTA_MULTIPLIERS, quotaMultiplierFor } from '../../supabase/functions/ai-proxy/logic'

describe('managed AI catalog — client ↔ proxy mirror', () => {
  it('client list and proxy allowlist are identical, order included', () => {
    // Order matters: suggestedModels[0] is the de-facto default model of the preset.
    expect(NOTEFLOW_AI_MODELS).toEqual([...DEFAULT_ALLOWED_MODELS])
  })

  it('has no duplicate ids', () => {
    expect(new Set(NOTEFLOW_AI_MODELS).size).toBe(NOTEFLOW_AI_MODELS.length)
  })

  it('the client meta describes exactly the catalog — no missing, no leftovers', () => {
    expect(Object.keys(NOTEFLOW_AI_MODEL_META).sort()).toEqual([...NOTEFLOW_AI_MODELS].sort())
  })

  it('every multiplier matches the proxy, in both directions', () => {
    // client → proxy: what the picker advertises is what the quota really charges.
    for (const [model, meta] of Object.entries(NOTEFLOW_AI_MODEL_META)) {
      expect(quotaMultiplierFor(model)).toBe(meta.quotaMultiplier)
    }
    // proxy → client: nothing is charged above ×1 without the UI knowing about it,
    // and no entry in the map has fallen out of the catalog.
    for (const [model, mult] of Object.entries(MODEL_QUOTA_MULTIPLIERS)) {
      expect(DEFAULT_ALLOWED_MODELS).toContain(model)
      expect(NOTEFLOW_AI_MODEL_META[model]?.quotaMultiplier).toBe(mult)
    }
  })

  it('the proxy map only lists models above the ×1 baseline', () => {
    for (const mult of Object.values(MODEL_QUOTA_MULTIPLIERS)) expect(mult).toBeGreaterThan(1)
    const baseline = NOTEFLOW_AI_MODELS.filter((m) => NOTEFLOW_AI_MODEL_META[m].quotaMultiplier === 1)
    for (const model of baseline) expect(MODEL_QUOTA_MULTIPLIERS).not.toHaveProperty(model)
  })

  it('every multiplier is a positive finite number', () => {
    for (const meta of Object.values(NOTEFLOW_AI_MODEL_META)) {
      expect(Number.isFinite(meta.quotaMultiplier)).toBe(true)
      expect(meta.quotaMultiplier).toBeGreaterThan(0)
    }
  })
})
