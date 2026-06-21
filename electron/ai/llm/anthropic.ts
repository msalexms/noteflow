// Anthropic provider — uses the official SDK (@anthropic-ai/sdk, pure JS, no native binary).
// Runs in the main process; the key is passed in already-decrypted and never leaves main.
import Anthropic from '@anthropic-ai/sdk'
import type {
  AgentMessage, AgentTurnOptions, AgentTurnResult, ChatOptions, LlmProvider, ResolvedLlmConfig, ToolCall,
} from './types'

// Fallback list shown if models.list() is unavailable (e.g. offline). The user can type any id.
const FALLBACK_MODELS = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5']

function toAnthropicMessages(messages: AgentMessage[]): Anthropic.MessageParam[] {
  return messages.map((m): Anthropic.MessageParam => {
    if (m.role === 'user') {
      if (!m.attachments?.length) return { role: 'user', content: m.content }
      // Mixed content: leading text + native document/image blocks (no local extraction).
      const blocks: Anthropic.ContentBlockParam[] = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const a of m.attachments) {
        if (a.kind === 'pdf') {
          blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } })
        } else {
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: a.mediaType as 'image/png', data: a.data },
          })
        }
      }
      return { role: 'user', content: blocks }
    }
    if (m.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const tc of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
      return { role: 'assistant', content: blocks }
    }
    // tool results are sent back to Anthropic as a user message of tool_result blocks
    return {
      role: 'user',
      content: m.results.map((r) => ({ type: 'tool_result', tool_use_id: r.toolCallId, content: r.content, is_error: r.isError })),
    }
  })
}

export class AnthropicProvider implements LlmProvider {
  constructor(private cfg: ResolvedLlmConfig) {}

  private client(): Anthropic {
    return new Anthropic({ apiKey: this.cfg.apiKey })
  }

  async chat(opts: ChatOptions, onDelta: (text: string) => void): Promise<void> {
    const messages = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m): AgentMessage => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    // Attach to the last user message (profile generation sends a single user turn).
    if (opts.attachments?.length) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') { (messages[i] as { attachments?: typeof opts.attachments }).attachments = opts.attachments; break }
      }
    }
    await this.streamTurn({ system: opts.system, messages, signal: opts.signal, maxTokens: opts.maxTokens }, onDelta)
  }

  async streamTurn(opts: AgentTurnOptions, onDelta: (text: string) => void): Promise<AgentTurnResult> {
    const client = this.client()
    // `thinking` is intentionally omitted for BYO compatibility (any Anthropic model the user
    // picks must work); the system prompt asks for a direct answer to avoid reasoning leaking
    // into the visible response on the Opus family.
    const params: Anthropic.MessageStreamParams = {
      model: this.cfg.model || 'claude-opus-4-8',
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: toAnthropicMessages(opts.messages),
    }
    if (opts.tools?.length) {
      params.tools = opts.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      }))
    }
    const stream = client.messages.stream(params, { signal: opts.signal })
    stream.on('text', (delta) => onDelta(delta))
    const final = await stream.finalMessage()

    let text = ''
    const toolCalls: ToolCall[] = []
    for (const block of final.content) {
      if (block.type === 'text') text += block.text
      else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> })
      }
    }
    return { text, toolCalls }
  }

  async listModels(): Promise<string[]> {
    try {
      const ids: string[] = []
      for await (const m of this.client().models.list()) ids.push(m.id)
      return ids.length > 0 ? ids : FALLBACK_MODELS
    } catch {
      return FALLBACK_MODELS
    }
  }

  async test(): Promise<{ ok: boolean; error?: string }> {
    try {
      // models.list is a cheap, unbilled call that still validates the key.
      await this.client().models.list()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
