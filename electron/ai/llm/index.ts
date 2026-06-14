// LLM provider factory + config resolution. main.ts owns persistence (settings.aiLlm);
// this module turns a stored config into a runnable provider and a renderer-safe public view.
// Each preset keeps its own baseUrl/model/key, so switching providers never mixes credentials.
import type { LlmConfigStored, LlmConfigPublic, ResolvedLlmConfig, LlmProvider } from './types'
import { presetOf } from './presets'
import { decryptSecret } from './secret'
import { AnthropicProvider } from './anthropic'
import { OpenAiCompatibleProvider } from './openaiCompatible'

export type {
  LlmConfigStored, LlmConfigPublic, ResolvedLlmConfig, LlmProvider, ChatMessage,
  ToolSchema, ToolCall, ToolResult, AgentMessage, AgentTurnResult,
} from './types'
export { PRESETS } from './presets'
export type { LlmPreset } from './presets'
export { encryptSecret, decryptSecret } from './secret'

export const DEFAULT_LLM_CONFIG: LlmConfigStored = { active: 'anthropic', byPreset: {} }

function effectiveModel(cfg: LlmConfigStored): string {
  const preset = presetOf(cfg.active)
  const ps = cfg.byPreset[preset.id] ?? {}
  return ps.model?.trim() || preset.suggestedModels[0] || ''
}
function effectiveBaseUrl(cfg: LlmConfigStored): string {
  const preset = presetOf(cfg.active)
  const ps = cfg.byPreset[preset.id] ?? {}
  return ps.baseUrl?.trim() || preset.baseUrl
}

/** Decrypt the active preset's key and fill defaults — in-memory only, never persisted. */
export function resolveConfig(cfg: LlmConfigStored): ResolvedLlmConfig {
  const preset = presetOf(cfg.active)
  const ps = cfg.byPreset[preset.id] ?? {}
  return {
    impl: preset.impl,
    model: effectiveModel(cfg),
    baseUrl: effectiveBaseUrl(cfg),
    apiKey: ps.encryptedApiKey ? decryptSecret(ps.encryptedApiKey) : '',
  }
}

/** Renderer-safe projection of the ACTIVE preset: no key, plus a `configured` flag the UI gates on. */
export function toPublic(cfg: LlmConfigStored): LlmConfigPublic {
  const preset = presetOf(cfg.active)
  const ps = cfg.byPreset[preset.id] ?? {}
  const model = effectiveModel(cfg)
  const hasKey = !!ps.encryptedApiKey
  return {
    active: preset.id,
    model,
    baseUrl: effectiveBaseUrl(cfg),
    hasKey,
    configured: (!preset.needsKey || hasKey) && !!model,
  }
}

export function getProvider(resolved: ResolvedLlmConfig): LlmProvider {
  if (resolved.impl === 'anthropic') return new AnthropicProvider(resolved)
  return new OpenAiCompatibleProvider(resolved)
}
