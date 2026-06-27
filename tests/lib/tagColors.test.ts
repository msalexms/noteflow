import { describe, it, expect } from 'vitest'
import {
  TAG_COLOR_VARS,
  normalizeTagColorKey,
  resolveColorVar,
  getTagColor,
} from '../../src/lib/tagColors'

// hashString and colorVar are module-private; their determinism and the
// "same tag → same color" guarantee are characterized through resolveColorVar.

describe('normalizeTagColorKey', () => {
  it('trims and lowercases', () => {
    expect(normalizeTagColorKey('  Work  ')).toBe('work')
    expect(normalizeTagColorKey('IDEA')).toBe('idea')
  })
})

describe('resolveColorVar', () => {
  it('is deterministic: same tag → same color across calls', () => {
    const a = resolveColorVar('project')
    const b = resolveColorVar('project')
    expect(a).toBe(b)
  })

  it('always returns one of the known color vars', () => {
    for (const name of ['work', 'idea', 'project', 'misc', 'x', 'another-tag']) {
      expect(TAG_COLOR_VARS).toContain(resolveColorVar(name))
    }
  })

  it('honours an override keyed by the normalized name', () => {
    const overrides = { work: '--red' as const }
    expect(resolveColorVar('Work', overrides)).toBe('--red')
    expect(resolveColorVar('  work ', overrides)).toBe('--red')
  })

  it('falls back to the hashed color when no override matches', () => {
    const overrides = { work: '--red' as const }
    expect(resolveColorVar('idea', overrides)).toBe(resolveColorVar('idea'))
  })
})

describe('getTagColor', () => {
  it('produces CSS strings referencing the resolved color var', () => {
    const v = resolveColorVar('work')
    const style = getTagColor('work')
    expect(style.color).toBe(`rgb(var(${v}))`)
    expect(style.background).toContain(`var(${v})`)
    expect(style.border).toContain(`var(${v})`)
  })
})
