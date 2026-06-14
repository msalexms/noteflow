// Catalog of LLM provider presets. Two underlying implementations cover everything:
//   - 'anthropic'  → official SDK (Claude)
//   - 'openai'     → OpenAI-compatible /chat/completions + /models (OpenAI, DeepSeek, MiniMax,
//                    OpenRouter, Ollama, and any custom server)
// Each preset stores its OWN baseUrl / model / key (see LlmConfigStored.byPreset), so switching
// providers never mixes credentials. Base URLs are editable so users can point at regional
// endpoints (e.g. MiniMax China) or self-hosted gateways.

export type LlmImpl = 'anthropic' | 'openai'

export interface LlmPreset {
  id: string
  label: string
  impl: LlmImpl
  baseUrl: string          // default; editable in the UI unless editableBaseUrl is false
  needsKey: boolean
  editableBaseUrl: boolean
  suggestedModels: string[]
}

export const PRESETS: LlmPreset[] = [
  { id: 'anthropic',  label: 'Anthropic (Claude)',          impl: 'anthropic', baseUrl: '',                              needsKey: true,  editableBaseUrl: false, suggestedModels: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'] },
  { id: 'openai',     label: 'OpenAI',                       impl: 'openai',    baseUrl: 'https://api.openai.com/v1',      needsKey: true,  editableBaseUrl: true,  suggestedModels: ['gpt-4o', 'gpt-4o-mini'] },
  { id: 'deepseek',   label: 'DeepSeek',                     impl: 'openai',    baseUrl: 'https://api.deepseek.com/v1',    needsKey: true,  editableBaseUrl: true,  suggestedModels: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'minimax',    label: 'MiniMax',                      impl: 'openai',    baseUrl: 'https://api.minimax.io/v1',      needsKey: true,  editableBaseUrl: true,  suggestedModels: ['MiniMax-Text-01'] },
  { id: 'moonshot',   label: 'Moonshot (Kimi)',              impl: 'openai',    baseUrl: 'https://api.moonshot.ai/v1',     needsKey: true,  editableBaseUrl: true,  suggestedModels: ['kimi-k2-0711-preview', 'moonshot-v1-8k'] },
  { id: 'openrouter', label: 'OpenRouter',                   impl: 'openai',    baseUrl: 'https://openrouter.ai/api/v1',   needsKey: true,  editableBaseUrl: true,  suggestedModels: [] },
  { id: 'ollama',     label: 'Ollama (local)',               impl: 'openai',    baseUrl: 'http://localhost:11434/v1',      needsKey: false, editableBaseUrl: true,  suggestedModels: [] },
  { id: 'custom',     label: 'Custom (OpenAI-compatible)',   impl: 'openai',    baseUrl: '',                               needsKey: false, editableBaseUrl: true,  suggestedModels: [] },
]

export const PRESET_BY_ID: Record<string, LlmPreset> = Object.fromEntries(PRESETS.map((p) => [p.id, p]))

export function presetOf(id: string): LlmPreset {
  return PRESET_BY_ID[id] ?? PRESETS[0]
}
