"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LLM_CONFIG = exports.decryptSecret = exports.encryptSecret = exports.PRESETS = void 0;
exports.withActiveProvider = withActiveProvider;
exports.byoFallbackProvider = byoFallbackProvider;
exports.resolveConfig = resolveConfig;
exports.resolveConfigAsync = resolveConfigAsync;
exports.providerCapabilities = providerCapabilities;
exports.toPublic = toPublic;
exports.notConfiguredMessage = notConfiguredMessage;
exports.getProvider = getProvider;
const presets_1 = require("./presets");
const secret_1 = require("./secret");
const anthropic_1 = require("./anthropic");
const openaiCompatible_1 = require("./openaiCompatible");
// No import cycle: account.ts only pulls ./secret and ./cloudConfig, never this module.
const account_1 = require("../../account");
var presets_2 = require("./presets");
Object.defineProperty(exports, "PRESETS", { enumerable: true, get: function () { return presets_2.PRESETS; } });
var secret_2 = require("./secret");
Object.defineProperty(exports, "encryptSecret", { enumerable: true, get: function () { return secret_2.encryptSecret; } });
Object.defineProperty(exports, "decryptSecret", { enumerable: true, get: function () { return secret_2.decryptSecret; } });
exports.DEFAULT_LLM_CONFIG = { active: 'anthropic', byPreset: {} };
/**
 * Switches the active preset, remembering the BYO provider being left behind
 * whenever the managed `noteflow` plan takes over. That memory (lastByoProvider)
 * is what a sign-out reverts to — the managed plan stops working without a
 * session, and silently dropping the user on the generic default would lose the
 * provider they had configured.
 */
function withActiveProvider(cfg, next) {
    const out = { ...cfg, active: next };
    if (next === 'noteflow' && cfg.active !== 'noteflow')
        out.lastByoProvider = cfg.active;
    return out;
}
/** Provider to fall back to when `noteflow` stops being usable: the last BYO one
 *  the user had active (if it is still a known preset), else the default. */
function byoFallbackProvider(cfg) {
    const last = cfg.lastByoProvider;
    if (last && last !== 'noteflow' && presets_1.PRESETS.some((p) => p.id === last))
        return last;
    return exports.DEFAULT_LLM_CONFIG.active;
}
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
/** Decrypt the active preset's key and fill defaults — in-memory only, never persisted.
 *  NOTE: for the managed `noteflow` preset this leaves apiKey empty — use
 *  resolveConfigAsync wherever a provider is about to make real requests. */
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
/**
 * Like resolveConfig, but for the managed `noteflow` preset the credential is a
 * FRESH Supabase access token of the NoteFlow account session (GoTrue tokens
 * expire in ~1h, so it must be minted per request — never stored like an API
 * key). Throws a user-facing error when there is no signed-in session.
 */
async function resolveConfigAsync(cfg) {
    const resolved = resolveConfig(cfg);
    if ((0, presets_1.presetOf)(cfg.active).id !== 'noteflow')
        return resolved;
    const token = await (0, account_1.getAccessToken)();
    if (!token) {
        throw new Error('NoteFlow AI needs your NoteFlow account. Sign in from Settings → Account and try again.');
    }
    return { ...resolved, apiKey: token };
}
/** Native attachment support per preset (the app never extracts text itself). */
function providerCapabilities(preset, activeModel) {
    // PDF is only reliable on Anthropic (native document blocks). Images (vision) are model-dependent,
    // so each preset declares a default via `images`: text-only providers (DeepSeek, MiniMax, Moonshot's
    // suggested models) set it to false; vision-capable/flexible ones default to true.
    // The managed `noteflow` preset mixes vision and text-only models in one catalog, so its vision
    // flag is PER MODEL (preset.modelMeta): the active model decides. Unknown/empty model → default true.
    let images = preset.images ?? true;
    if (preset.modelMeta && activeModel) {
        images = preset.modelMeta[activeModel]?.images ?? images;
    }
    return { images, pdf: preset.impl === 'anthropic' };
}
/** Renderer-safe projection of the ACTIVE preset: no key, plus a `configured` flag the UI gates on. */
function toPublic(cfg) {
    const preset = (0, presets_1.presetOf)(cfg.active);
    const ps = cfg.byPreset[preset.id] ?? {};
    const model = effectiveModel(cfg);
    const hasKey = !!ps.encryptedApiKey;
    let configured = (!preset.needsKey || hasKey) && !!model;
    if (preset.id === 'noteflow') {
        // The managed plan is only usable with a signed-in account AND an active
        // 'ai' (or 'bundle') subscription — otherwise the proxy answers 401/403.
        const status = (0, account_1.getAccountStatus)();
        configured = configured && status.signedIn && status.entitlements.ai;
    }
    return {
        active: preset.id,
        model,
        baseUrl: effectiveBaseUrl(cfg),
        hasKey,
        configured,
        capabilities: providerCapabilities(preset, model),
    };
}
/** User-facing reason why toPublic().configured is false — tailored for the managed preset. */
function notConfiguredMessage(cfg) {
    if ((0, presets_1.presetOf)(cfg.active).id === 'noteflow') {
        const status = (0, account_1.getAccountStatus)();
        if (!status.signedIn)
            return 'NoteFlow AI needs your NoteFlow account — sign in from Settings → Account.';
        if (!status.entitlements.ai)
            return 'NoteFlow AI requires an active subscription — manage your plan in Settings → Account.';
    }
    return 'No LLM provider configured';
}
function getProvider(resolved) {
    if (resolved.impl === 'anthropic')
        return new anthropic_1.AnthropicProvider(resolved);
    return new openaiCompatible_1.OpenAiCompatibleProvider(resolved);
}
