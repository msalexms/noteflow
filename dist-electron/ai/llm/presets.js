"use strict";
// Catalog of LLM provider presets. Two underlying implementations cover everything:
//   - 'anthropic'  → official SDK (Claude)
//   - 'openai'     → OpenAI-compatible /chat/completions + /models (OpenAI, DeepSeek, MiniMax,
//                    OpenRouter, Ollama, and any custom server)
// Each preset stores its OWN baseUrl / model / key (see LlmConfigStored.byPreset), so switching
// providers never mixes credentials. Base URLs are editable so users can point at regional
// endpoints (e.g. MiniMax China) or self-hosted gateways.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESET_BY_ID = exports.PRESETS = exports.NOTEFLOW_AI_MODEL_META = exports.NOTEFLOW_AI_MODELS = void 0;
exports.presetOf = presetOf;
const cloudConfig_1 = require("../../cloudConfig");
/**
 * Curated OpenRouter model ids served by the managed NoteFlow AI plan. All are
 * tool-calling capable (the chat is agentic); all support vision EXCEPT the two
 * DeepSeek models (text-only — see NOTEFLOW_AI_MODEL_META). KEEP IN SYNC with
 * DEFAULT_ALLOWED_MODELS in supabase/functions/ai-proxy/logic.ts — the proxy
 * rejects anything else.
 */
exports.NOTEFLOW_AI_MODELS = [
    // Standard models (×1 quota).
    'openai/gpt-4o-mini',
    'openai/gpt-4.1-mini',
    'anthropic/claude-haiku-4.5',
    'google/gemini-2.5-flash',
    'deepseek/deepseek-v4-flash',
    'deepseek/deepseek-v4-pro',
    'minimax/minimax-m3',
    // Advanced models (×6 quota).
    'anthropic/claude-sonnet-5',
    'openai/gpt-5.2',
    'google/gemini-3.5-flash',
];
/**
 * Per-model metadata for the managed plan:
 *   - quotaMultiplier: what a real token costs against the monthly quota
 *     (KEEP IN SYNC with MODEL_QUOTA_MULTIPLIERS in
 *     supabase/functions/ai-proxy/logic.ts — there only the non-×1 entries are
 *     listed; here every curated model is spelled out for the UI).
 *   - images: native vision support (the two DeepSeek models are text-only).
 * Exposed to the renderer through the preset's `modelMeta` field so the model
 * picker can flag quota cost, and used by providerCapabilities (llm/index.ts)
 * to gate image attachments per active model.
 */
exports.NOTEFLOW_AI_MODEL_META = {
    'openai/gpt-4o-mini': { quotaMultiplier: 1, images: true },
    'openai/gpt-4.1-mini': { quotaMultiplier: 1, images: true },
    'anthropic/claude-haiku-4.5': { quotaMultiplier: 1, images: true },
    'google/gemini-2.5-flash': { quotaMultiplier: 1, images: true },
    'deepseek/deepseek-v4-flash': { quotaMultiplier: 1, images: false },
    'deepseek/deepseek-v4-pro': { quotaMultiplier: 1, images: false },
    'minimax/minimax-m3': { quotaMultiplier: 1, images: true },
    'anthropic/claude-sonnet-5': { quotaMultiplier: 6, images: true },
    'openai/gpt-5.2': { quotaMultiplier: 6, images: true },
    'google/gemini-3.5-flash': { quotaMultiplier: 6, images: true },
};
exports.PRESETS = [
    // NoteFlow AI: the managed plan (subscription). The "key" is a fresh Supabase access token of
    // the signed-in NoteFlow account, resolved per request in resolveConfigAsync (llm/index.ts).
    { id: 'noteflow', label: 'NoteFlow AI', impl: 'openai', baseUrl: cloudConfig_1.AI_PROXY_URL, needsKey: false, editableBaseUrl: false, suggestedModels: exports.NOTEFLOW_AI_MODELS, modelMeta: exports.NOTEFLOW_AI_MODEL_META },
    { id: 'anthropic', label: 'Anthropic (Claude)', impl: 'anthropic', baseUrl: '', needsKey: true, editableBaseUrl: false, suggestedModels: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'] },
    { id: 'openai', label: 'OpenAI', impl: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true, editableBaseUrl: true, suggestedModels: ['gpt-4o', 'gpt-4o-mini'] },
    { id: 'deepseek', label: 'DeepSeek', impl: 'openai', baseUrl: 'https://api.deepseek.com/v1', needsKey: true, editableBaseUrl: true, suggestedModels: ['deepseek-chat', 'deepseek-reasoner'], images: false },
    { id: 'minimax', label: 'MiniMax', impl: 'openai', baseUrl: 'https://api.minimax.io/v1', needsKey: true, editableBaseUrl: true, suggestedModels: ['MiniMax-Text-01'], images: false },
    { id: 'moonshot', label: 'Moonshot (Kimi)', impl: 'openai', baseUrl: 'https://api.moonshot.ai/v1', needsKey: true, editableBaseUrl: true, suggestedModels: ['kimi-k2-0711-preview', 'moonshot-v1-8k'], images: false },
    { id: 'openrouter', label: 'OpenRouter', impl: 'openai', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, editableBaseUrl: true, suggestedModels: [] },
    { id: 'opencode', label: 'OpenCode Zen', impl: 'openai', baseUrl: 'https://opencode.ai/zen/go/v1', needsKey: true, editableBaseUrl: true, suggestedModels: [] },
    { id: 'ollama', label: 'Ollama (local)', impl: 'openai', baseUrl: 'http://localhost:11434/v1', needsKey: false, editableBaseUrl: true, suggestedModels: [] },
    { id: 'custom', label: 'Custom (OpenAI-compatible)', impl: 'openai', baseUrl: '', needsKey: false, editableBaseUrl: true, suggestedModels: [] },
];
exports.PRESET_BY_ID = Object.fromEntries(exports.PRESETS.map((p) => [p.id, p]));
function presetOf(id) {
    // Unknown/corrupted ids fall back to Anthropic (the historical default and
    // DEFAULT_LLM_CONFIG.active) — deliberately NOT PRESETS[0], which is now the
    // managed NoteFlow AI preset and must never hijack existing users' configs.
    return exports.PRESET_BY_ID[id] ?? exports.PRESET_BY_ID['anthropic'];
}
