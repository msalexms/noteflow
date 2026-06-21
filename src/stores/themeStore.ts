import { create } from 'zustand'
import { THEMES, DEFAULT_THEME_ID, APP_FONTS, DEFAULT_APP_FONT } from '../lib/themes'
import type { Theme } from '../lib/themes'

const FONT_OVERRIDE_KEY = 'noteflow-font-override'
const ACCENT_OVERRIDE_KEY = 'noteflow-accent-override'
const HEADING_OVERRIDES_KEY = 'noteflow-heading-overrides'
const UI_SCALE_KEY = 'noteflow-ui-scale'

export type HeadingLevel = 'h1' | 'h2' | 'h3'
/** Per-heading colour overrides as "r g b" triplets, or null to follow the theme. */
export type HeadingOverrides = Record<HeadingLevel, string | null>

const EMPTY_HEADING_OVERRIDES: HeadingOverrides = { h1: null, h2: null, h3: null }

// Each heading falls back to a theme var when not overridden (see index.css):
// h1 → --accent, h2 → --cyan, h3 → --text.
const HEADING_VARS: Record<HeadingLevel, string> = {
  h1: '--heading-1',
  h2: '--heading-2',
  h3: '--heading-3',
}

function parseHeadingOverrides(raw: string | null): HeadingOverrides {
  if (!raw) return { ...EMPTY_HEADING_OVERRIDES }
  try {
    const parsed = JSON.parse(raw) as Partial<HeadingOverrides>
    return {
      h1: parsed.h1 ?? null,
      h2: parsed.h2 ?? null,
      h3: parsed.h3 ?? null,
    }
  } catch {
    return { ...EMPTY_HEADING_OVERRIDES }
  }
}

function applyHeadingOverrides(overrides: HeadingOverrides) {
  const root = document.documentElement
  for (const level of Object.keys(HEADING_VARS) as HeadingLevel[]) {
    const value = overrides[level]
    if (value) root.style.setProperty(HEADING_VARS[level], value)
    else root.style.removeProperty(HEADING_VARS[level])
  }
}

// Preset UI scale steps. Small 5% increments so bumping the size never jumps
// jarringly. Applied as a CSS zoom on the document root so the whole UI scales
// proportionally (the codebase already uses `zoom` for note previews).
export const UI_SCALES = [0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3]
export const DEFAULT_UI_SCALE = 1.0

function nearestScale(value: number): number {
  return UI_SCALES.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best), UI_SCALES[0])
}

function applyUiScale(scale: number) {
  // `zoom` is non-standard but supported in Chromium/Electron; 1 == no zoom.
  ;(document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(scale)
}

// A theme provides a base palette + its own app font + accent. On top of that the
// user can override the app font and the accent colour independently; those layer
// over whichever theme is active and persist across theme switches until cleared.
function applyTheme(theme: Theme, fontOverride: string | null, accentOverride: string | null) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme.id)
  root.style.colorScheme = theme.colorScheme
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value)
  }
  // App-level font (UI chrome) — user override, else the theme's own font.
  const fontId = fontOverride ?? theme.font
  const font = APP_FONTS[fontId] ?? APP_FONTS[DEFAULT_APP_FONT]
  root.style.setProperty('--app-font-family', font.stack)
  // Accent — user override (stored as an "r g b" triplet), else the theme's accent.
  root.style.setProperty('--accent', accentOverride ?? theme.vars['--accent'])
}

interface ThemeState {
  activeThemeId: string
  /** APP_FONTS key chosen by the user, or null to follow the theme's own font. */
  fontOverride: string | null
  /** Accent as an "r g b" triplet chosen by the user, or null to follow the theme. */
  accentOverride: string | null
  /** Per-heading colour overrides ("r g b" triplets) layered over the theme. */
  headingOverrides: HeadingOverrides
  /** UI zoom factor (one of UI_SCALES). */
  uiScale: number
  initTheme: () => void
  setTheme: (id: string) => void
  setFontOverride: (id: string | null) => void
  setAccentOverride: (rgb: string | null) => void
  setHeadingOverride: (level: HeadingLevel, rgb: string | null) => void
  resetHeadingOverrides: () => void
  /** Step the UI scale up (+1) or down (-1) through the preset steps. */
  changeUiScale: (direction: 1 | -1) => void
}

function currentTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  activeThemeId: DEFAULT_THEME_ID,
  fontOverride: null,
  accentOverride: null,
  headingOverrides: { ...EMPTY_HEADING_OVERRIDES },
  uiScale: DEFAULT_UI_SCALE,

  initTheme: () => {
    const saved = window.noteflow.getTheme() ?? DEFAULT_THEME_ID
    const theme = currentTheme(saved)
    const fontOverride = localStorage.getItem(FONT_OVERRIDE_KEY)
    const accentOverride = localStorage.getItem(ACCENT_OVERRIDE_KEY)
    const headingOverrides = parseHeadingOverrides(localStorage.getItem(HEADING_OVERRIDES_KEY))
    const storedScale = parseFloat(localStorage.getItem(UI_SCALE_KEY) ?? '')
    const uiScale = Number.isFinite(storedScale) ? nearestScale(storedScale) : DEFAULT_UI_SCALE
    applyTheme(theme, fontOverride, accentOverride)
    applyHeadingOverrides(headingOverrides)
    applyUiScale(uiScale)
    set({ activeThemeId: theme.id, fontOverride, accentOverride, headingOverrides, uiScale })
  },

  setTheme: (id) => {
    const theme = THEMES.find((t) => t.id === id)
    if (!theme) return
    const { fontOverride, accentOverride } = get()
    applyTheme(theme, fontOverride, accentOverride)
    window.noteflow.setTheme(id)
    set({ activeThemeId: id })
  },

  setFontOverride: (id) => {
    if (id) localStorage.setItem(FONT_OVERRIDE_KEY, id)
    else localStorage.removeItem(FONT_OVERRIDE_KEY)
    applyTheme(currentTheme(get().activeThemeId), id, get().accentOverride)
    set({ fontOverride: id })
  },

  setAccentOverride: (rgb) => {
    if (rgb) localStorage.setItem(ACCENT_OVERRIDE_KEY, rgb)
    else localStorage.removeItem(ACCENT_OVERRIDE_KEY)
    applyTheme(currentTheme(get().activeThemeId), get().fontOverride, rgb)
    set({ accentOverride: rgb })
  },

  setHeadingOverride: (level, rgb) => {
    const next = { ...get().headingOverrides, [level]: rgb }
    if (next.h1 === null && next.h2 === null && next.h3 === null) localStorage.removeItem(HEADING_OVERRIDES_KEY)
    else localStorage.setItem(HEADING_OVERRIDES_KEY, JSON.stringify(next))
    applyHeadingOverrides(next)
    set({ headingOverrides: next })
  },

  resetHeadingOverrides: () => {
    const next = { ...EMPTY_HEADING_OVERRIDES }
    localStorage.removeItem(HEADING_OVERRIDES_KEY)
    applyHeadingOverrides(next)
    set({ headingOverrides: next })
  },

  changeUiScale: (direction) => {
    const idx = UI_SCALES.indexOf(nearestScale(get().uiScale))
    const next = UI_SCALES[Math.max(0, Math.min(UI_SCALES.length - 1, idx + direction))]
    localStorage.setItem(UI_SCALE_KEY, String(next))
    applyUiScale(next)
    set({ uiScale: next })
  },
}))
