import { describe, it, expect, vi } from 'vitest'

// electron/ai/llm pulls in account.ts → electron (app/safeStorage). None of it is
// touched by the two pure helpers under test; the stub just lets the module load.
vi.mock('electron', () => ({
  app: { getPath: () => '.' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8'),
  },
}))

const { withActiveProvider, byoFallbackProvider, resolveConfig, acceptsModel, DEFAULT_LLM_CONFIG } = await import(
  '../../electron/ai/llm'
)
const { NOTEFLOW_AI_MODELS } = await import('../../electron/ai/llm/presets')
type LlmConfigStored = import('../../electron/ai/llm').LlmConfigStored

const base: LlmConfigStored = { active: 'ollama', byPreset: {} }

describe('withActiveProvider', () => {
  it('remembers the BYO provider left behind when the managed plan takes over', () => {
    expect(withActiveProvider(base, 'noteflow')).toEqual({
      active: 'noteflow',
      byPreset: {},
      lastByoProvider: 'ollama',
    })
  })

  it('does not overwrite the memory when noteflow is already active', () => {
    const managed: LlmConfigStored = { active: 'noteflow', byPreset: {}, lastByoProvider: 'ollama' }
    expect(withActiveProvider(managed, 'noteflow').lastByoProvider).toBe('ollama')
  })

  it('switching between BYO providers does not touch the memory', () => {
    const cfg: LlmConfigStored = { active: 'noteflow', byPreset: {}, lastByoProvider: 'ollama' }
    const next = withActiveProvider(cfg, 'openai')
    expect(next.active).toBe('openai')
    expect(next.lastByoProvider).toBe('ollama')
  })
})

describe('byoFallbackProvider', () => {
  it('returns the remembered BYO provider', () => {
    expect(byoFallbackProvider({ active: 'noteflow', byPreset: {}, lastByoProvider: 'ollama' })).toBe('ollama')
  })

  it('falls back to the default with no memory', () => {
    expect(byoFallbackProvider({ active: 'noteflow', byPreset: {} })).toBe(DEFAULT_LLM_CONFIG.active)
  })

  it('never falls back to the managed preset itself', () => {
    expect(byoFallbackProvider({ active: 'noteflow', byPreset: {}, lastByoProvider: 'noteflow' })).toBe(
      DEFAULT_LLM_CONFIG.active
    )
  })

  it('ignores a preset id that no longer exists (a preset dropped from a later build)', () => {
    expect(byoFallbackProvider({ active: 'noteflow', byPreset: {}, lastByoProvider: 'gone-provider' })).toBe(
      DEFAULT_LLM_CONFIG.active
    )
  })
})

// The managed plan serves a CURATED catalog that rotates; the proxy rejects anything
// outside it, so a stored model that left the catalog must not keep being sent.
describe('resolveConfig — model of the managed (curated) preset', () => {
  const managed = (model?: string): LlmConfigStored => ({
    active: 'noteflow',
    byPreset: model === undefined ? {} : { noteflow: { model } },
  })

  it('keeps a stored model that is still in the catalog', () => {
    const current = NOTEFLOW_AI_MODELS[NOTEFLOW_AI_MODELS.length - 1]
    expect(resolveConfig(managed(current)).model).toBe(current)
  })

  it('falls back to the first curated model when the stored one left the catalog', () => {
    expect(resolveConfig(managed('openai/gpt-4o-mini')).model).toBe(NOTEFLOW_AI_MODELS[0])
  })

  it('uses the first curated model when nothing is stored yet', () => {
    expect(resolveConfig(managed()).model).toBe(NOTEFLOW_AI_MODELS[0])
    expect(resolveConfig(managed('  ')).model).toBe(NOTEFLOW_AI_MODELS[0])
  })

  it('never rewrites the model of a BYO preset (any id the provider serves is valid)', () => {
    const byo: LlmConfigStored = { active: 'ollama', byPreset: { ollama: { model: 'llama3.2:3b' } } }
    expect(resolveConfig(byo).model).toBe('llama3.2:3b')
    const openai: LlmConfigStored = { active: 'openai', byPreset: { openai: { model: 'gpt-4.1' } } }
    expect(resolveConfig(openai).model).toBe('gpt-4.1')
  })
})

// The write-side half of the same invariant (stored ≡ used): main drops a model patch this
// rejects, so an id outside a curated catalog never reaches settings.json in the first place.
describe('acceptsModel', () => {
  it('accepts any id of the curated catalog', () => {
    for (const model of NOTEFLOW_AI_MODELS) expect(acceptsModel('noteflow', model)).toBe(true)
  })

  it('rejects an id that left the curated catalog', () => {
    expect(acceptsModel('noteflow', 'openai/gpt-5.2')).toBe(false)
    expect(acceptsModel('noteflow', '')).toBe(false)
    // Half-typed input: what the read-only field in the UI prevents, and main drops anyway.
    expect(acceptsModel('noteflow', 'o')).toBe(false)
  })

  it('trims exactly like effectiveModel, so both guards agree on the same id', () => {
    const padded = `  ${NOTEFLOW_AI_MODELS[0]}  `
    expect(acceptsModel('noteflow', padded)).toBe(true)
    expect(resolveConfig({ active: 'noteflow', byPreset: { noteflow: { model: padded } } }).model).toBe(
      NOTEFLOW_AI_MODELS[0]
    )
  })

  it('accepts anything for a BYO preset', () => {
    expect(acceptsModel('ollama', 'llama3.2:3b')).toBe(true)
    expect(acceptsModel('openai', 'some-model-shipped-tomorrow')).toBe(true)
  })

  it('accepts anything for an unknown preset id (presetOf falls back to anthropic — no catalog)', () => {
    expect(acceptsModel('gone-provider', 'whatever')).toBe(true)
  })
})
