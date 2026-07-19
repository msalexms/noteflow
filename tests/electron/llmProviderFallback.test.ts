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

const { withActiveProvider, byoFallbackProvider, DEFAULT_LLM_CONFIG } = await import('../../electron/ai/llm')
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
