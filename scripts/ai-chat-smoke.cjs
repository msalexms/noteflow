// Headless smoke test for the LLM chat provider (OpenAI-compatible path).
// Run with: node scripts/ai-chat-smoke.cjs
// Validates: model listing, SSE streaming → text deltas, and AbortSignal cancellation.
// Uses a tiny local mock server, so it needs no real provider/network. The Anthropic provider
// and the safeStorage-backed config live behind Electron and are exercised manually.
const http = require('http')
const path = require('path')

const { OpenAiCompatibleProvider } = require(
  path.join(__dirname, '..', 'dist-electron', 'ai', 'llm', 'openaiCompatible.js'),
)

let pass = 0
let fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.error(`  ✗ ${name}`) }
}

// ── Mock OpenAI-compatible server ──
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.endsWith('/models')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'mock-small' }, { id: 'mock-large' }] }))
    return
  }
  if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let parsed = {}
      try { parsed = JSON.parse(body) } catch { /* ignore */ }
      const hasTools = Array.isArray(parsed.tools) && parsed.tools.length > 0
      const alreadyRanTool = (parsed.messages || []).some((m) => m.role === 'tool')

      res.writeHead(200, { 'content-type': 'text/event-stream' })

      // First turn with tools → stream a tool_call with arguments fragmented across chunks.
      let frames
      if (hasTools && !alreadyRanTool) {
        frames = [
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'create_note', arguments: '{"ti' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'tle":"Hi"}' } }] } }] },
        ]
      } else {
        // No tools, or the follow-up turn after a tool result → plain text.
        const text = alreadyRanTool ? ['Created', '.'] : ['Hello', ', ', 'notes', '!']
        frames = text.map((t) => ({ choices: [{ delta: { content: t } }] }))
      }

      let i = 0
      const timer = setInterval(() => {
        if (i < frames.length) {
          res.write(`data: ${JSON.stringify(frames[i++])}\n\n`)
        } else {
          res.write('data: [DONE]\n\n')
          clearInterval(timer)
          res.end()
        }
      }, 30)
      // Tie cleanup to the RESPONSE closing, not the request — on modern Node the request
      // emits 'close' as soon as its body is consumed, which would kill the interval early.
      res.on('close', () => clearInterval(timer))
    })
    return
  }
  res.writeHead(404); res.end()
})

async function main() {
  await new Promise((r) => server.listen(0, r))
  const port = server.address().port
  const baseUrl = `http://localhost:${port}/v1`
  const provider = new OpenAiCompatibleProvider({ provider: 'openai', model: 'mock-small', baseUrl, apiKey: '' })

  console.log('LLM chat provider smoke test\n')

  // 1) list models
  const models = await provider.listModels()
  check('listModels returns the mock models', models.includes('mock-small') && models.includes('mock-large'))

  // 2) test()
  const t = await provider.test()
  check('test() succeeds against the mock', t.ok === true)

  // 3) streaming chat
  let out = ''
  await provider.chat({ messages: [{ role: 'user', content: 'hi' }] }, (d) => { out += d })
  check('chat streams deltas in order', out === 'Hello, notes!')

  // 4) abort
  const controller = new AbortController()
  let aborted = false
  const p = provider
    .chat({ messages: [{ role: 'user', content: 'hi' }], signal: controller.signal }, () => {})
    .catch(() => { aborted = true })
  setTimeout(() => controller.abort(), 40)
  await p
  check('chat aborts via AbortSignal', aborted === true)

  // 5) tool calling: streamTurn accumulates fragmented tool_calls by index
  const tools = [{ name: 'create_note', description: 'Create a note', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } }]
  const r1 = await provider.streamTurn({ messages: [{ role: 'user', content: 'make a note titled Hi' }], tools }, () => {})
  check('streamTurn returns one tool call', r1.toolCalls.length === 1)
  check('tool call name is parsed', r1.toolCalls[0]?.name === 'create_note')
  check('tool call arguments are reassembled + JSON-parsed', r1.toolCalls[0]?.input?.title === 'Hi')

  // 6) follow-up turn carrying the tool result → final text, no more tool calls
  let finalText = ''
  const r2 = await provider.streamTurn({
    tools,
    messages: [
      { role: 'user', content: 'make a note titled Hi' },
      { role: 'assistant', content: '', toolCalls: r1.toolCalls },
      { role: 'tool', results: [{ toolCallId: r1.toolCalls[0].id, content: 'Created note with id abc' }] },
    ],
  }, (d) => { finalText += d })
  check('follow-up turn streams final text', finalText === 'Created.')
  check('follow-up turn has no tool calls', r2.toolCalls.length === 0)

  server.close()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => { console.error(err); process.exit(1) })
