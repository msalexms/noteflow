// OpenAI-compatible provider — one fetch-based implementation that covers OpenAI, Ollama
// (baseUrl http://localhost:11434/v1), LM Studio, OpenRouter, and any other server speaking
// the /chat/completions + /models contract. Ollama exposes both endpoints under /v1.
import type {
  AgentMessage, AgentTurnOptions, AgentTurnResult, ChatOptions, LlmProvider, ResolvedLlmConfig, ToolCall,
} from './types'

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

// User content may be a plain string or, when images are attached, an array of multimodal parts.
type OpenAiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | OpenAiContentPart[]
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

function toOpenAiMessages(system: string | undefined, messages: AgentMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = []
  if (system) out.push({ role: 'system', content: system })
  for (const m of messages) {
    if (m.role === 'user') {
      // Only images are sent natively here (PDFs aren't offered for OpenAI-compatible providers).
      const images = (m.attachments ?? []).filter((a) => a.kind === 'image')
      if (images.length) {
        const parts: OpenAiContentPart[] = []
        if (m.content) parts.push({ type: 'text', text: m.content })
        for (const img of images) {
          parts.push({ type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.data}` } })
        }
        out.push({ role: 'user', content: parts })
      } else {
        out.push({ role: 'user', content: m.content })
      }
    } else if (m.role === 'assistant') {
      const msg: OpenAiMessage = { role: 'assistant', content: m.content || '' }
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        }))
      }
      out.push(msg)
    } else {
      // each tool result becomes its own `tool` message keyed by the call id
      for (const r of m.results) out.push({ role: 'tool', tool_call_id: r.toolCallId, content: r.content })
    }
  }
  return out
}

function safeParseArgs(args: string): Record<string, unknown> {
  if (!args.trim()) return {}
  try {
    const parsed = JSON.parse(args)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Render an SSE error payload as a single line. The machine code goes FIRST so it survives the
 * length cap: main's `friendlyChatError` matches on it (e.g. `monthly_quota_exceeded` for the
 * NoteFlow AI monthly quota), so losing it would turn a localized message into raw JSON.
 */
function describeStreamError(error: unknown): string {
  if (typeof error === 'string') return error.slice(0, 300)
  const e = (error ?? {}) as { code?: unknown; type?: unknown }
  const code = typeof e.code === 'string' && e.code ? e.code : typeof e.type === 'string' && e.type ? e.type : ''
  let detail: string
  try {
    detail = JSON.stringify(error) ?? String(error)
  } catch {
    detail = String(error)
  }
  return `${code ? `${code} — ` : ''}${detail.slice(0, 300)}`
}

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private cfg: ResolvedLlmConfig) {}

  private get base(): string {
    return trimSlash(this.cfg.baseUrl)
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' }
    if (this.cfg.apiKey) h['authorization'] = `Bearer ${this.cfg.apiKey}`
    return h
  }

  async chat(opts: ChatOptions, onDelta: (text: string) => void): Promise<void> {
    const messages = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m): AgentMessage => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    if (opts.attachments?.length) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') { (messages[i] as { attachments?: typeof opts.attachments }).attachments = opts.attachments; break }
      }
    }
    await this.streamTurn({ system: opts.system, messages, signal: opts.signal, maxTokens: opts.maxTokens }, onDelta)
  }

  async streamTurn(opts: AgentTurnOptions, onDelta: (text: string) => void): Promise<AgentTurnResult> {
    const body: Record<string, unknown> = {
      model: this.cfg.model,
      messages: toOpenAiMessages(opts.system, opts.messages),
      stream: true,
      max_tokens: opts.maxTokens ?? 4096,
    }
    if (opts.tools?.length) {
      body.tools = opts.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }))
      body.tool_choice = 'auto'
    }
    const res = await fetch(`${this.base}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: opts.signal,
    })
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let text = ''
    // tool_calls arrive fragmented across SSE chunks; accumulate by their array index.
    const accum = new Map<number, { id: string; name: string; args: string }>()

    // Returns true on the terminating [DONE] frame; a failure reported mid-stream throws.
    const drain = (data: string): boolean => {
      if (data === '[DONE]') return true
      let json: {
        error?: unknown
        choices?: Array<{
          delta?: {
            content?: string
            tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
          }
        }>
      }
      try {
        json = JSON.parse(data)
      } catch {
        // keepalive or partial frame — ignore
        return false
      }
      // Gateways (OpenRouter, the NoteFlow AI proxy) can fail AFTER the stream started and report
      // it as a `data: {"error": …}` frame instead of an HTTP error. Swallowing it would truncate
      // the answer with no feedback at all, so raise it and let ai:chat surface it.
      if (json.error) throw new Error(`Stream error — ${describeStreamError(json.error)}`)
      const delta = json.choices?.[0]?.delta
      if (delta?.content) { text += delta.content; onDelta(delta.content) }
      for (const tc of delta?.tool_calls ?? []) {
        const cur = accum.get(tc.index) ?? { id: '', name: '', args: '' }
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.name = tc.function.name
        if (tc.function?.arguments) cur.args += tc.function.arguments
        accum.set(tc.index, cur)
      }
      return false
    }

    try {
      let finished = false
      while (!finished) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line.startsWith('data:')) continue
          if (drain(line.slice(5).trim())) { finished = true; break }
        }
      }
    } catch (err) {
      void reader.cancel().catch(() => {}) // best effort: don't leave the response hanging
      throw err
    }

    const toolCalls: ToolCall[] = [...accum.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([, v]) => v.name)
      .map(([i, v]) => ({ id: v.id || `call_${i}`, name: v.name, input: safeParseArgs(v.args) }))
    return { text, toolCalls }
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.base}/models`, { headers: this.headers() })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    const json = (await res.json()) as { data?: Array<{ id: string }> }
    return (json.data ?? []).map((m) => m.id).sort()
  }

  async test(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.base}/models`, { headers: this.headers() })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        return { ok: false, error: `HTTP ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}` }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
