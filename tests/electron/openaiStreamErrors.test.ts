import { describe, it, expect, vi, afterEach } from 'vitest'
import { OpenAiCompatibleProvider } from '../../electron/ai/llm/openaiCompatible'
import type { ResolvedLlmConfig } from '../../electron/ai/llm/types'

// The provider is plain fetch + SSE parsing (no electron imports), so it runs as-is here.
// What's under test: a failure reported MID-STREAM as a `data: {"error": …}` frame must be
// raised, not swallowed — otherwise the answer just stops with zero feedback in the chat.

const cfg: ResolvedLlmConfig = { impl: 'openai', baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm' }

/** Serve an SSE body one chunk at a time, like a streaming response would. */
function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  let i = 0
  const cancel = vi.fn(async () => {})
  const reader = {
    read: async () => (i < chunks.length ? { done: false, value: encoder.encode(chunks[i++]) } : { done: true, value: undefined }),
    cancel,
  }
  return { res: { ok: true, status: 200, statusText: 'OK', body: { getReader: () => reader } }, cancel }
}

function stubFetch(chunks: string[]) {
  const { res, cancel } = sseResponse(chunks)
  vi.stubGlobal('fetch', vi.fn(async () => res))
  return cancel
}

afterEach(() => { vi.unstubAllGlobals() })

const provider = () => new OpenAiCompatibleProvider(cfg)

describe('streamTurn — mid-stream error frames', () => {
  it('throws keeping the machine code, so friendlyChatError can localize the quota message', async () => {
    stubFetch([
      'data: {"choices":[{"delta":{"content":"Sure, let me check"}}]}\n',
      'data: {"error":{"message":"Monthly token quota exceeded","type":"insufficient_quota","code":"monthly_quota_exceeded"}}\n',
    ])
    await expect(provider().streamTurn({ messages: [{ role: 'user', content: 'hi' }] }, () => {}))
      .rejects.toThrow(/monthly_quota_exceeded/)
  })

  it('keeps a numeric code + message readable in the thrown error', async () => {
    stubFetch(['data: {"error":{"code":429,"message":"Rate limit exceeded"}}\n'])
    await expect(provider().streamTurn({ messages: [{ role: 'user', content: 'hi' }] }, () => {}))
      .rejects.toThrow(/Rate limit exceeded/)
  })

  it('cancels the reader when it bails out', async () => {
    const cancel = stubFetch(['data: {"error":{"message":"boom","code":"server_error"}}\n'])
    await expect(provider().streamTurn({ messages: [{ role: 'user', content: 'hi' }] }, () => {}))
      .rejects.toThrow()
    expect(cancel).toHaveBeenCalled()
  })

  it('still ignores keepalives and partial frames', async () => {
    stubFetch([
      ': ping\n',
      'data: {"choices":[{"delta":{"content":"Hel',
      'lo"}}]}\ndata: {"choices":[{"delta":{"content":" world"}}]}\n',
      'data: [DONE]\n',
    ])
    const seen: string[] = []
    const out = await provider().streamTurn({ messages: [{ role: 'user', content: 'hi' }] }, (d) => seen.push(d))
    expect(out.text).toBe('Hello world')
    expect(seen.join('')).toBe('Hello world')
    expect(out.toolCalls).toEqual([])
  })

  it('does not treat a null error field as a failure', async () => {
    stubFetch(['data: {"error":null,"choices":[{"delta":{"content":"ok"}}]}\n', 'data: [DONE]\n'])
    const out = await provider().streamTurn({ messages: [{ role: 'user', content: 'hi' }] }, () => {})
    expect(out.text).toBe('ok')
  })
})
