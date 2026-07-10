import { describe, it, expect, afterEach, vi } from 'vitest'
import { resolveLang, getMessages } from '../../src/i18n'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubLocale(language: string) {
  vi.stubGlobal('navigator', { language })
}

describe('resolveLang', () => {
  it('returns an explicit language as-is (ignores navigator)', () => {
    stubLocale('fr-FR')
    expect(resolveLang('en')).toBe('en')
    expect(resolveLang('es')).toBe('es')
  })

  it("resolves 'system' from navigator locale", () => {
    stubLocale('es-ES')
    expect(resolveLang('system')).toBe('es')
    stubLocale('es-MX')
    expect(resolveLang('system')).toBe('es')
    stubLocale('en-US')
    expect(resolveLang('system')).toBe('en')
  })

  it("falls back to English for non-Spanish locales", () => {
    stubLocale('fr-FR')
    expect(resolveLang('system')).toBe('en')
    stubLocale('de')
    expect(resolveLang('system')).toBe('en')
  })

  it("defaults to English when navigator is unavailable", () => {
    vi.stubGlobal('navigator', undefined)
    expect(resolveLang('system')).toBe('en')
  })
})

describe('getMessages', () => {
  it('returns the matching message tree', () => {
    expect(getMessages('es').settings.nav.general).toBe('General')
    expect(getMessages('en').settings.nav.appearance).toBe('Appearance')
    expect(getMessages('es').settings.nav.appearance).toBe('Apariencia')
  })
})
