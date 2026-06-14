"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicProvider = void 0;
// Anthropic provider — uses the official SDK (@anthropic-ai/sdk, pure JS, no native binary).
// Runs in the main process; the key is passed in already-decrypted and never leaves main.
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
// Fallback list shown if models.list() is unavailable (e.g. offline). The user can type any id.
const FALLBACK_MODELS = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
function toAnthropicMessages(messages) {
    return messages.map((m) => {
        if (m.role === 'user')
            return { role: 'user', content: m.content };
        if (m.role === 'assistant') {
            const blocks = [];
            if (m.content)
                blocks.push({ type: 'text', text: m.content });
            for (const tc of m.toolCalls ?? [])
                blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
            return { role: 'assistant', content: blocks };
        }
        // tool results are sent back to Anthropic as a user message of tool_result blocks
        return {
            role: 'user',
            content: m.results.map((r) => ({ type: 'tool_result', tool_use_id: r.toolCallId, content: r.content, is_error: r.isError })),
        };
    });
}
class AnthropicProvider {
    constructor(cfg) {
        this.cfg = cfg;
    }
    client() {
        return new sdk_1.default({ apiKey: this.cfg.apiKey });
    }
    async chat(opts, onDelta) {
        const messages = opts.messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content }));
        await this.streamTurn({ system: opts.system, messages, signal: opts.signal, maxTokens: opts.maxTokens }, onDelta);
    }
    async streamTurn(opts, onDelta) {
        const client = this.client();
        // `thinking` is intentionally omitted for BYO compatibility (any Anthropic model the user
        // picks must work); the system prompt asks for a direct answer to avoid reasoning leaking
        // into the visible response on the Opus family.
        const params = {
            model: this.cfg.model || 'claude-opus-4-8',
            max_tokens: opts.maxTokens ?? 4096,
            system: opts.system,
            messages: toAnthropicMessages(opts.messages),
        };
        if (opts.tools?.length) {
            params.tools = opts.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema,
            }));
        }
        const stream = client.messages.stream(params, { signal: opts.signal });
        stream.on('text', (delta) => onDelta(delta));
        const final = await stream.finalMessage();
        let text = '';
        const toolCalls = [];
        for (const block of final.content) {
            if (block.type === 'text')
                text += block.text;
            else if (block.type === 'tool_use') {
                toolCalls.push({ id: block.id, name: block.name, input: (block.input ?? {}) });
            }
        }
        return { text, toolCalls };
    }
    async listModels() {
        try {
            const ids = [];
            for await (const m of this.client().models.list())
                ids.push(m.id);
            return ids.length > 0 ? ids : FALLBACK_MODELS;
        }
        catch {
            return FALLBACK_MODELS;
        }
    }
    async test() {
        try {
            // models.list is a cheap, unbilled call that still validates the key.
            await this.client().models.list();
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
}
exports.AnthropicProvider = AnthropicProvider;
