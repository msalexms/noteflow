import { describe, it, expect } from 'vitest'
import {
  TAG_COLOR_VARS,
  colorChannels,
  isCustomColor,
  normalizeGroupColor,
  normalizeTagColorKey,
  resolveGroupColor,
  getTagColor,
} from '../../src/lib/tagColors'

// hashString and colorVar are module-private; their determinism and the
// "same tag → same color" guarantee are characterized through resolveGroupColor.

describe('normalizeTagColorKey', () => {
  it('trims and lowercases', () => {
    expect(normalizeTagColorKey('  Work  ')).toBe('work')
    expect(normalizeTagColorKey('IDEA')).toBe('idea')
  })
})

describe('resolveGroupColor', () => {
  it('is deterministic: same tag → same color across calls', () => {
    const a = resolveGroupColor('project')
    const b = resolveGroupColor('project')
    expect(a).toBe(b)
  })

  it('always returns one of the known color vars', () => {
    for (const name of ['work', 'idea', 'project', 'misc', 'x', 'another-tag']) {
      expect(TAG_COLOR_VARS).toContain(resolveGroupColor(name))
    }
  })

  it('honours an override keyed by the normalized name', () => {
    const overrides = { work: '--red' as const }
    expect(resolveGroupColor('Work', overrides)).toBe('--red')
    expect(resolveGroupColor('  work ', overrides)).toBe('--red')
  })

  it('honours a custom hex override', () => {
    const overrides = { work: '#7aa2f7' as const }
    expect(resolveGroupColor('Work', overrides)).toBe('#7aa2f7')
  })

  it('falls back to the hashed color when no override matches', () => {
    const overrides = { work: '--red' as const }
    expect(resolveGroupColor('idea', overrides)).toBe(resolveGroupColor('idea'))
  })
})

describe('isCustomColor', () => {
  it('accepts full hex colours, in any case', () => {
    expect(isCustomColor('#7aa2f7')).toBe(true)
    expect(isCustomColor('#7AA2F7')).toBe(true)
  })

  it('rejects theme vars, shorthand hex and junk', () => {
    expect(isCustomColor('--accent')).toBe(false)
    expect(isCustomColor('#abc')).toBe(false)
    expect(isCustomColor('7aa2f7')).toBe(false)
    expect(isCustomColor('rgb(1 2 3)')).toBe(false)
  })
})

describe('normalizeGroupColor', () => {
  it('keeps the theme vars as-is', () => {
    for (const v of TAG_COLOR_VARS) expect(normalizeGroupColor(v)).toBe(v)
    expect(normalizeGroupColor('  --red  ')).toBe('--red')
  })

  it('lowercases full hex colours', () => {
    expect(normalizeGroupColor('#7AA2F7')).toBe('#7aa2f7')
    expect(normalizeGroupColor(' #7aa2f7 ')).toBe('#7aa2f7')
  })

  it('expands shorthand hex colours', () => {
    expect(normalizeGroupColor('#abc')).toBe('#aabbcc')
    expect(normalizeGroupColor('#ABC')).toBe('#aabbcc')
  })

  it('rejects unknown vars, malformed hex and non-strings', () => {
    expect(normalizeGroupColor('--nope')).toBeNull()
    expect(normalizeGroupColor('#12345')).toBeNull()
    expect(normalizeGroupColor('#gggggg')).toBeNull()
    expect(normalizeGroupColor('red')).toBeNull()
    expect(normalizeGroupColor('')).toBeNull()
    expect(normalizeGroupColor(null)).toBeNull()
    expect(normalizeGroupColor(42)).toBeNull()
    expect(normalizeGroupColor({ color: '--red' })).toBeNull()
  })
})

describe('colorChannels', () => {
  it('wraps theme vars so alpha composition still works', () => {
    expect(colorChannels('--accent')).toBe('var(--accent)')
    expect(`rgb(${colorChannels('--accent')} / 0.2)`).toBe('rgb(var(--accent) / 0.2)')
  })

  it('expands hex colours to decimal channels', () => {
    expect(colorChannels('#7aa2f7')).toBe('122 162 247')
    expect(colorChannels('#000000')).toBe('0 0 0')
    expect(colorChannels('#ffffff')).toBe('255 255 255')
    expect(`rgb(${colorChannels('#7aa2f7')} / 0.2)`).toBe('rgb(122 162 247 / 0.2)')
  })
})

describe('getTagColor', () => {
  it('produces CSS strings referencing the resolved color var', () => {
    const v = resolveGroupColor('work')
    const style = getTagColor('work')
    expect(style.color).toBe(`rgb(var(${v}))`)
    expect(style.background).toContain(`var(${v})`)
    expect(style.border).toContain(`var(${v})`)
  })

  it('inlines the channels of a custom hex override', () => {
    const style = getTagColor('work', { work: '#7aa2f7' })
    expect(style.color).toBe('rgb(122 162 247)')
    expect(style.background).toBe('rgb(122 162 247 / 0.12)')
    expect(style.border).toBe('1px solid rgb(122 162 247 / 0.28)')
  })
})
