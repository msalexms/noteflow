"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LLM_CONFIG = exports.decryptSecret = exports.encryptSecret = exports.PRESETS = void 0;
exports.resolveConfig = resolveConfig;
exports.toPublic = toPublic;
exports.getProvider = getProvider;
const presets_1 = require("./presets");
const secret_1 = require("./secret");
const anthropic_1 = require("./anthropic");
const openaiCompatible_1 = require("./openaiCompatible");
var presets_2 = require("./presets");
Object.defineProperty(exports, "PRESETS", { enumerable: true, get: function () { return presets_2.PRESETS; } });
var secret_2 = require("./secret");
Object.defineProperty(exports, "encryptSecret", { enumerable: true, get: function () { return secret_2.encryptSecret; } });
Object.defineProperty(exports, "decryptSecret", { enumerable: true, get: function () { return secret_2.decryptSecret; } });
exports.DEFAULT_LLM_CONFIG = { active: 'anthropic', byPreset: {} };
function effectiveModel(cfg) {
    const preset = (0, presets_1.presetOf)(cfg.active);
    const ps = cfg.byPreset[preset.id] ?? {};
    return ps.model?.trim() || preset.suggestedModels[0] || '';
}
function effectiveBaseUrl(cfg) {
    const preset = (0, presets_1.presetOf)(cfg.active);
    const ps = cfg.byPreset[preset.id] ?? {};
    return ps.baseUrl?.trim() || preset.baseUrl;
}
/** Decrypt the active preset's key and fill defaults — in-memory only, never persisted. */
function resolveConfig(cfg) {
    const preset = (0, presets_1.presetOf)(cfg.active);
    const ps = cfg.byPreset[preset.id] ?? {};
    return {
        impl: preset.impl,
        model: effectiveModel(cfg),
        baseUrl: effectiveBaseUrl(cfg),
        apiKey: ps.encryptedApiKey ? (0, secret_1.decryptSecret)(ps.encryptedApiKey) : '',
    };
}
/** Renderer-safe projection of the ACTIVE preset: no key, plus a `configured` flag the UI gates on. */
function toPublic(cfg) {
    const preset = (0, presets_1.presetOf)(cfg.active);
    const ps = cfg.byPreset[preset.id] ?? {};
    const model = effectiveModel(cfg);
    const hasKey = !!ps.encryptedApiKey;
    return {
        active: preset.id,
        model,
        baseUrl: effectiveBaseUrl(cfg),
        hasKey,
        configured: (!preset.needsKey || hasKey) && !!model,
    };
}
function getProvider(resolved) {
    if (resolved.impl === 'anthropic')
        return new anthropic_1.AnthropicProvider(resolved);
    return new openaiCompatible_1.OpenAiCompatibleProvider(resolved);
}
