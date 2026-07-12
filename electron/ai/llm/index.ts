// LLM provider factory + config resolution. main.ts owns persistence (settings.aiLlm);
// this module turns a stored config into a runnable provider and a renderer-safe public view.
// Each preset keeps its own baseUrl/model/key, so switching providers never mixes credentials.
import type { LlmConfigStored, LlmConfigPublic, ResolvedLlmConfig, LlmProvider, ProviderCapabilities } from './types'
import { presetOf, type LlmPreset } from './presets'
import { decryptSecret } from './secret'
import { AnthropicProvider } from './anthropic'
import { OpenAiCompatibleProvider } from './openaiCompatible'
// No import cycle: account.ts only pulls ./secret and ./cloudConfig, never this module.
import { getAccessToken, getAccountStatus } from '../../account'

export type {
  LlmConfigStored, LlmConfigPublic, ResolvedLlmConfig, LlmProvider, ChatMessage,
  ToolSchema, ToolCall, ToolResult, AgentMessage, AgentTurnResult, Attachment, ProviderCapabilities,
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

/** Decrypt the active preset's key and fill defaults — in-memory only, never persisted.
 *  NOTE: for the managed `noteflow` preset this leaves apiKey empty — use
 *  resolveConfigAsync wherever a provider is about to make real requests. */
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

/**
 * Like resolveConfig, but for the managed `noteflow` preset the credential is a
 * FRESH Supabase access token of the NoteFlow account session (GoTrue tokens
 * expire in ~1h, so it must be minted per request — never stored like an API
 * key). Throws a user-facing error when there is no signed-in session.
 */
export async function resolveConfigAsync(cfg: LlmConfigStored): Promise<ResolvedLlmConfig> {
  const resolved = resolveConfig(cfg)
  if (presetOf(cfg.active).id !== 'noteflow') return resolved
  const token = await getAccessToken()
  if (!token) {
    throw new Error('NoteFlow AI needs your NoteFlow account. Sign in from Settings → Account and try again.')
  }
  return { ...resolved, apiKey: token }
}

/** Native attachment support per preset (the app never extracts text itself). */
export function providerCapabilities(preset: LlmPreset, activeModel?: string): ProviderCapabilities {
  // PDF is only reliable on Anthropic (native document blocks). Images (vision) are model-dependent,
  // so each preset declares a default via `images`: text-only providers (DeepSeek, MiniMax, Moonshot's
  // suggested models) set it to false; vision-capable/flexible ones default to true.
  // The managed `noteflow` preset mixes vision and text-only models in one catalog, so its vision
  // flag is PER MODEL (preset.modelMeta): the active model decides. Unknown/empty model → default true.
  let images = preset.images ?? true
  if (preset.modelMeta && activeModel) {
    images = preset.modelMeta[activeModel]?.images ?? images
  }
  return { images, pdf: preset.impl === 'anthropic' }
}

/** Renderer-safe projection of the ACTIVE preset: no key, plus a `configured` flag the UI gates on. */
export function toPublic(cfg: LlmConfigStored): LlmConfigPublic {
  const preset = presetOf(cfg.active)
  const ps = cfg.byPreset[preset.id] ?? {}
  const model = effectiveModel(cfg)
  const hasKey = !!ps.encryptedApiKey
  let configured = (!preset.needsKey || hasKey) && !!model
  if (preset.id === 'noteflow') {
    // The managed plan is only usable with a signed-in account AND an active
    // 'ai' (or 'bundle') subscription — otherwise the proxy answers 401/403.
    const status = getAccountStatus()
    configured = configured && status.signedIn && status.entitlements.ai
  }
  return {
    active: preset.id,
    model,
    baseUrl: effectiveBaseUrl(cfg),
    hasKey,
    configured,
    capabilities: providerCapabilities(preset, model),
  }
}

/** User-facing reason why toPublic().configured is false — tailored for the managed preset. */
export function notConfiguredMessage(cfg: LlmConfigStored): string {
  if (presetOf(cfg.active).id === 'noteflow') {
    const status = getAccountStatus()
    if (!status.signedIn) return 'NoteFlow AI needs your NoteFlow account — sign in from Settings → Account.'
    if (!status.entitlements.ai) return 'NoteFlow AI requires an active subscription — manage your plan in Settings → Account.'
  }
  return 'No LLM provider configured'
}

export function getProvider(resolved: ResolvedLlmConfig): LlmProvider {
  if (resolved.impl === 'anthropic') return new AnthropicProvider(resolved)
  return new OpenAiCompatibleProvider(resolved)
}
