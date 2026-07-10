"use strict";
// Catalog of LLM provider presets. Two underlying implementations cover everything:
//   - 'anthropic'  → official SDK (Claude)
//   - 'openai'     → OpenAI-compatible /chat/completions + /models (OpenAI, DeepSeek, MiniMax,
//                    OpenRouter, Ollama, and any custom server)
// Each preset stores its OWN baseUrl / model / key (see LlmConfigStored.byPreset), so switching
// providers never mixes credentials. Base URLs are editable so users can point at regional
// endpoints (e.g. MiniMax China) or self-hosted gateways.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESET_BY_ID = exports.PRESETS = exports.NOTEFLOW_AI_MODELS = void 0;
exports.presetOf = presetOf;
const cloudConfig_1 = require("../../cloudConfig");
/**
 * Curated OpenRouter model ids served by the managed NoteFlow AI plan (all
 * tool-calling + vision capable). KEEP IN SYNC with DEFAULT_ALLOWED_MODELS in
 * supabase/functions/ai-proxy/logic.ts — the proxy rejects anything else.
 */
exports.NOTEFLOW_AI_MODELS = [
    'openai/gpt-4o-mini',
    'openai/gpt-4.1-mini',
    'anthropic/claude-haiku-4.5',
    'google/gemini-2.5-flash',
];
exports.PRESETS = [
    // NoteFlow AI: the managed plan (subscription). The "key" is a fresh Supabase access token of
    // the signed-in NoteFlow account, resolved per request in resolveConfigAsync (llm/index.ts).
    { id: 'noteflow', label: 'NoteFlow AI', impl: 'openai', baseUrl: cloudConfig_1.AI_PROXY_URL, needsKey: false, editableBaseUrl: false, suggestedModels: exports.NOTEFLOW_AI_MODELS },
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
