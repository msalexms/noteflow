"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiCompatibleProvider = void 0;
function trimSlash(url) {
    return url.replace(/\/+$/, '');
}
function toOpenAiMessages(system, messages) {
    const out = [];
    if (system)
        out.push({ role: 'system', content: system });
    for (const m of messages) {
        if (m.role === 'user') {
            // Only images are sent natively here (PDFs aren't offered for OpenAI-compatible providers).
            const images = (m.attachments ?? []).filter((a) => a.kind === 'image');
            if (images.length) {
                const parts = [];
                if (m.content)
                    parts.push({ type: 'text', text: m.content });
                for (const img of images) {
                    parts.push({ type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.data}` } });
                }
                out.push({ role: 'user', content: parts });
            }
            else {
                out.push({ role: 'user', content: m.content });
            }
        }
        else if (m.role === 'assistant') {
            const msg = { role: 'assistant', content: m.content || '' };
            if (m.toolCalls?.length) {
                msg.tool_calls = m.toolCalls.map((tc) => ({
                    id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.input) },
                }));
            }
            out.push(msg);
        }
        else {
            // each tool result becomes its own `tool` message keyed by the call id
            for (const r of m.results)
                out.push({ role: 'tool', tool_call_id: r.toolCallId, content: r.content });
        }
    }
    return out;
}
function safeParseArgs(args) {
    if (!args.trim())
        return {};
    try {
        const parsed = JSON.parse(args);
        return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
        return {};
    }
}
class OpenAiCompatibleProvider {
    constructor(cfg) {
        this.cfg = cfg;
    }
    get base() {
        return trimSlash(this.cfg.baseUrl);
    }
    headers() {
        const h = { 'content-type': 'application/json' };
        if (this.cfg.apiKey)
            h['authorization'] = `Bearer ${this.cfg.apiKey}`;
        return h;
    }
    async chat(opts, onDelta) {
        const messages = opts.messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content }));
        if (opts.attachments?.length) {
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                    messages[i].attachments = opts.attachments;
                    break;
                }
            }
        }
        await this.streamTurn({ system: opts.system, messages, signal: opts.signal, maxTokens: opts.maxTokens }, onDelta);
    }
    async streamTurn(opts, onDelta) {
        const body = {
            model: this.cfg.model,
            messages: toOpenAiMessages(opts.system, opts.messages),
            stream: true,
            max_tokens: opts.maxTokens ?? 4096,
        };
        if (opts.tools?.length) {
            body.tools = opts.tools.map((t) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.inputSchema },
            }));
            body.tool_choice = 'auto';
        }
        const res = await fetch(`${this.base}/chat/completions`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: opts.signal,
        });
        if (!res.ok || !res.body) {
            const detail = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let text = '';
        // tool_calls arrive fragmented across SSE chunks; accumulate by their array index.
        const accum = new Map();
        const drain = (data) => {
            if (data === '[DONE]')
                return true;
            try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta;
                if (delta?.content) {
                    text += delta.content;
                    onDelta(delta.content);
                }
                for (const tc of delta?.tool_calls ?? []) {
                    const cur = accum.get(tc.index) ?? { id: '', name: '', args: '' };
                    if (tc.id)
                        cur.id = tc.id;
                    if (tc.function?.name)
                        cur.name = tc.function.name;
                    if (tc.function?.arguments)
                        cur.args += tc.function.arguments;
                    accum.set(tc.index, cur);
                }
            }
            catch {
                // keepalive or partial frame — ignore
            }
            return false;
        };
        let finished = false;
        while (!finished) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buf += decoder.decode(value, { stream: true });
            let nl;
            while ((nl = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (!line.startsWith('data:'))
                    continue;
                if (drain(line.slice(5).trim())) {
                    finished = true;
                    break;
                }
            }
        }
        const toolCalls = [...accum.entries()]
            .sort((a, b) => a[0] - b[0])
            .filter(([, v]) => v.name)
            .map(([i, v]) => ({ id: v.id || `call_${i}`, name: v.name, input: safeParseArgs(v.args) }));
        return { text, toolCalls };
    }
    async listModels() {
        const res = await fetch(`${this.base}/models`, { headers: this.headers() });
        if (!res.ok)
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const json = (await res.json());
        return (json.data ?? []).map((m) => m.id).sort();
    }
    async test() {
        try {
            const res = await fetch(`${this.base}/models`, { headers: this.headers() });
            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                return { ok: false, error: `HTTP ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}` };
            }
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
}
exports.OpenAiCompatibleProvider = OpenAiCompatibleProvider;
