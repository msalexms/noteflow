import { useState } from 'react'
import { Check, ChevronDown, Minus, Plus, RotateCcw } from 'lucide-react'
import { THEMES, APP_FONTS } from '../../lib/themes'
import { useThemeStore } from '../../stores/themeStore'
import { useBrainSettingsStore } from '../../stores/brainSettingsStore'
import { UI_SCALES } from '../../stores/themeStore'
import type { HeadingLevel } from '../../stores/themeStore'
import type { Theme } from '../../lib/themes'
import { tf } from '../../i18n/format'
import { useT } from '../../i18n/useT'

// Each heading level follows a theme var until the user overrides it.
const HEADING_LEVELS: { level: HeadingLevel; label: string; themeVar: '--accent' | '--cyan' | '--text' }[] = [
  { level: 'h1', label: 'H1', themeVar: '--accent' },
  { level: 'h2', label: 'H2', themeVar: '--cyan' },
  { level: 'h3', label: 'H3', themeVar: '--text' },
]

// Curated accent presets (as "r g b" triplets) spanning the hue wheel, on top of
// which the user can still pick any custom colour via the native colour input.
const ACCENT_PRESETS: string[] = [
  '122 162 247', // blue
  '78 158 255',  // bright blue
  '78 201 176',  // teal
  '158 206 106', // green
  '224 175 104', // amber
  '255 158 100', // orange
  '247 118 142', // red
  '255 121 198', // pink
  '187 154 247', // purple
  '125 207 255', // cyan
]

function rgbToHex(rgb: string): string {
  const [r, g, b] = rgb.trim().split(/\s+/).map(Number)
  const h = (n: number) => Math.max(0, Math.min(255, n || 0)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function hexToRgb(hex: string): string {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16)
  const g = parseInt(m.slice(2, 4), 16)
  const b = parseInt(m.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

export function AppearancePanel() {
  const activeThemeId = useThemeStore((s) => s.activeThemeId)
  const fontOverride = useThemeStore((s) => s.fontOverride)
  const accentOverride = useThemeStore((s) => s.accentOverride)
  const setTheme = useThemeStore((s) => s.setTheme)
  const setFontOverride = useThemeStore((s) => s.setFontOverride)
  const setAccentOverride = useThemeStore((s) => s.setAccentOverride)
  const headingOverrides = useThemeStore((s) => s.headingOverrides)
  const setHeadingOverride = useThemeStore((s) => s.setHeadingOverride)
  const resetHeadingOverrides = useThemeStore((s) => s.resetHeadingOverrides)
  const uiScale = useThemeStore((s) => s.uiScale)
  const changeUiScale = useThemeStore((s) => s.changeUiScale)
  const prefer3D = useBrainSettingsStore((s) => s.prefer3D)
  const setPrefer3D = useBrainSettingsStore((s) => s.setPrefer3D)
  const t = useT()

  const [showAllThemes, setShowAllThemes] = useState(false)

  const theme = THEMES.find((th) => th.id === activeThemeId) ?? THEMES[0]
  const effectiveFontId = fontOverride ?? theme.font
  const effectiveAccent = accentOverride ?? theme.vars['--accent']
  const fonts = Object.values(APP_FONTS)

  // Effective colour for each heading level — the override, else the theme var.
  const headingColor = (l: typeof HEADING_LEVELS[number]) => headingOverrides[l.level] ?? theme.vars[l.themeVar]
  const headingsOverridden = HEADING_LEVELS.some((l) => headingOverrides[l.level] !== null)

  // Only the first four themes show by default; the rest live behind a toggle.
  const primaryThemes = THEMES.slice(0, 4)
  const moreThemes = THEMES.slice(4)

  const scalePct = Math.round(uiScale * 100)
  const atMinScale = uiScale <= UI_SCALES[0]
  const atMaxScale = uiScale >= UI_SCALES[UI_SCALES.length - 1]

  function renderThemeCard(th: Theme) {
    const selected = th.id === activeThemeId
    return (
      <button
        key={th.id}
        onClick={() => setTheme(th.id)}
        className="relative text-left rounded-md border p-2 transition-all"
        style={{
          background: `rgb(${th.vars['--bg-1']})`,
          borderColor: selected ? `rgb(${th.vars['--accent']})` : `rgb(${th.vars['--border']})`,
          boxShadow: selected ? `0 0 0 1px rgb(${th.vars['--accent']})` : undefined,
        }}
      >
        <div className="flex items-center gap-1 mb-1.5">
          {(['--bg-0', '--bg-2', '--accent', '--accent-2', '--cyan'] as const).map((v) => (
            <span
              key={v}
              className="w-3.5 h-3.5 rounded-full border"
              style={{ background: `rgb(${th.vars[v]})`, borderColor: `rgb(${th.vars['--border']})` }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] truncate" style={{ color: `rgb(${th.vars['--text']})`, fontFamily: APP_FONTS[th.font]?.stack }}>
            {th.label}
          </span>
          {selected && <Check size={11} style={{ color: `rgb(${th.vars['--accent']})` }} className="flex-shrink-0" />}
        </div>
      </button>
    )
  }

  return (
    <div className="flex min-h-0 gap-4">
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex-1 space-y-5">
        {/* Theme */}
        <section>
          <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">{t.settings.appearance.theme}</div>
          <div className="grid grid-cols-2 gap-2">
            {primaryThemes.map(renderThemeCard)}
          </div>
          {moreThemes.length > 0 && (
            <>
              {showAllThemes && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {moreThemes.map(renderThemeCard)}
                </div>
              )}
              <button
                onClick={() => setShowAllThemes((v) => !v)}
                className="mt-2 flex items-center gap-1 text-[11px] font-mono text-text-muted hover:text-text transition-colors"
              >
                <ChevronDown size={11} className={`transition-transform ${showAllThemes ? 'rotate-180' : ''}`} />
                {showAllThemes ? t.settings.appearance.fewerThemes : tf(t.settings.appearance.moreThemes, { count: moreThemes.length })}
              </button>
            </>
          )}
        </section>

        {/* Font */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest">{t.settings.appearance.font}</div>
            {fontOverride !== null && (
              <button
                onClick={() => setFontOverride(null)}
                className="flex items-center gap-1 text-[11px] font-mono text-text-muted hover:text-text transition-colors"
              >
                <RotateCcw size={9} /> {t.settings.appearance.themeDefault}
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {fonts.map((f) => {
              // A font tile is "selected" when it matches the effective font, but we
              // only badge it as the explicit override when the user actually chose it.
              const isEffective = f.id === effectiveFontId
              const isOverride = f.id === fontOverride
              return (
                <button
                  key={f.id}
                  onClick={() => setFontOverride(f.id)}
                  className={`rounded-md border px-2 py-2 text-left transition-colors ${
                    isEffective ? 'border-accent bg-accent/[0.08]' : 'border-border hover:bg-surface-2'
                  }`}
                  style={{ fontFamily: f.stack }}
                  title={isOverride ? t.settings.appearance.fontSelected : f.label}
                >
                  <div className="text-sm text-text leading-none mb-1">Ag</div>
                  <div className={`text-[11px] truncate ${isEffective ? 'text-accent' : 'text-text-muted'}`}>{f.label}</div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Accent */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest">{t.settings.appearance.accent}</div>
            {accentOverride !== null && (
              <button
                onClick={() => setAccentOverride(null)}
                className="flex items-center gap-1 text-[11px] font-mono text-text-muted hover:text-text transition-colors"
              >
                <RotateCcw size={9} /> {t.settings.appearance.themeDefault}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_PRESETS.map((rgb) => {
              const selected = effectiveAccent.trim() === rgb
              return (
                <button
                  key={rgb}
                  onClick={() => setAccentOverride(rgb)}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                  style={{
                    background: `rgb(${rgb})`,
                    boxShadow: selected ? '0 0 0 2px rgb(var(--bg-1)), 0 0 0 4px rgb(var(--text) / 0.6)' : undefined,
                  }}
                  title={`rgb(${rgb})`}
                >
                  {selected && <Check size={13} className="text-white drop-shadow" />}
                </button>
              )
            })}
            {/* Custom colour picker */}
            <label
              className="w-7 h-7 rounded-full border border-dashed border-text-muted/50 flex items-center justify-center cursor-pointer hover:border-text-muted transition-colors relative overflow-hidden"
              title={t.settings.appearance.customColour}
              style={{ background: `conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)` }}
            >
              <input
                type="color"
                value={rgbToHex(effectiveAccent)}
                onChange={(e) => setAccentOverride(hexToRgb(e.target.value))}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>
        </section>

        {/* Headings */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest">{t.settings.appearance.headings}</div>
            {headingsOverridden && (
              <button
                onClick={resetHeadingOverrides}
                className="flex items-center gap-1 text-[11px] font-mono text-text-muted hover:text-text transition-colors"
              >
                <RotateCcw size={9} /> {t.settings.appearance.themeDefault}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {HEADING_LEVELS.map((l) => {
              const color = headingColor(l)
              return (
                <div key={l.level} className="flex items-center gap-2">
                  <span
                    className="w-8 flex-shrink-0 text-sm font-bold leading-none tabular-nums"
                    style={{ color: `rgb(${color})` }}
                  >
                    {l.label}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ACCENT_PRESETS.map((rgb) => {
                      const selected = color.trim() === rgb
                      return (
                        <button
                          key={rgb}
                          onClick={() => setHeadingOverride(l.level, rgb)}
                          className="w-5 h-5 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                          style={{
                            background: `rgb(${rgb})`,
                            boxShadow: selected ? '0 0 0 2px rgb(var(--bg-1)), 0 0 0 3px rgb(var(--text) / 0.6)' : undefined,
                          }}
                          title={`rgb(${rgb})`}
                        >
                          {selected && <Check size={10} className="text-white drop-shadow" />}
                        </button>
                      )
                    })}
                    {/* Custom colour picker */}
                    <label
                      className="w-5 h-5 rounded-full border border-dashed border-text-muted/50 flex items-center justify-center cursor-pointer hover:border-text-muted transition-colors relative overflow-hidden"
                      title={t.settings.appearance.customColour}
                      style={{ background: `conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)` }}
                    >
                      <input
                        type="color"
                        value={rgbToHex(color)}
                        onChange={(e) => setHeadingOverride(l.level, hexToRgb(e.target.value))}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </label>
                    {headingOverrides[l.level] !== null && (
                      <button
                        onClick={() => setHeadingOverride(l.level, null)}
                        className="text-text-muted hover:text-text transition-colors"
                        title={t.settings.appearance.resetToThemeDefault}
                      >
                        <RotateCcw size={11} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Text size */}
        <section>
          <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">{t.settings.appearance.textSize}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeUiScale(-1)}
              disabled={atMinScale}
              className="w-8 h-8 flex items-center justify-center rounded-md border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={t.settings.appearance.smaller}
            >
              <Minus size={14} />
            </button>
            <div className="min-w-[56px] text-center text-xs font-mono text-text tabular-nums">{scalePct}%</div>
            <button
              onClick={() => changeUiScale(1)}
              disabled={atMaxScale}
              className="w-8 h-8 flex items-center justify-center rounded-md border border-border text-text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={t.settings.appearance.larger}
            >
              <Plus size={14} />
            </button>
          </div>
        </section>

        {/* Brain view */}
        <section>
          <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest mb-2">{t.settings.appearance.brainView}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { value: true, label: '3D', desc: t.settings.appearance.immersive },
              { value: false, label: '2D', desc: t.settings.appearance.lightweight },
            ] as const).map((opt) => {
              const selected = prefer3D === opt.value
              return (
                <button
                  key={opt.label}
                  onClick={() => setPrefer3D(opt.value)}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${
                    selected ? 'border-accent bg-accent/[0.08]' : 'border-border hover:bg-surface-2'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-mono ${selected ? 'text-accent' : 'text-text'}`}>{opt.label}</span>
                    {selected && <Check size={12} className="text-accent flex-shrink-0" />}
                  </div>
                  <div className="text-[11px] text-text-muted">{opt.desc}</div>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-muted/80">
            {t.settings.appearance.brainViewHint}
          </p>
        </section>
      </div>

      {/* ── Live preview ─────────────────────────────────────────────────── */}
      <div className="w-[280px] flex-shrink-0 border-l border-border pl-4 flex flex-col gap-3">
        <div className="text-[11px] font-mono text-text-muted/70 uppercase tracking-widest">{t.settings.appearance.preview}</div>
        <div className="rounded-lg border border-border overflow-hidden bg-surface-0 shadow-inner">
          {/* fake titlebar */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-surface-2 border-b border-border">
            <span className="w-2 h-2 rounded-full bg-red/70" />
            <span className="w-2 h-2 rounded-full bg-accent-3/70" />
            <span className="w-2 h-2 rounded-full bg-accent-2/70" />
            <span className="ml-auto text-[8px] px-1.5 py-0.5 rounded border border-accent/60 bg-accent/[0.15] text-accent font-mono">
              brain
            </span>
          </div>
          {/* body */}
          <div className="flex h-[176px]">
            {/* sidebar */}
            <div className="w-[42%] bg-surface-1 border-r border-border p-1.5 space-y-1">
              <div className="h-4 rounded bg-surface-2 border border-border" />
              <div className="px-1.5 py-1 rounded bg-text/[0.1] border border-text/15 text-text text-[8px] font-mono truncate">
                {t.settings.appearance.previewActiveNote}
              </div>
              <div className="px-1.5 py-1 text-text/70 text-[8px] font-mono truncate">{t.settings.appearance.previewAnotherNote}</div>
              <div className="px-1.5 py-1 text-text/70 text-[8px] font-mono truncate">{t.settings.appearance.previewThirdNote}</div>
            </div>
            {/* editor */}
            <div className="flex-1 p-2 space-y-1.5 bg-surface-0 overflow-hidden">
              <div className="font-bold text-[12px] font-mono leading-none" style={{ color: `rgb(${headingColor(HEADING_LEVELS[0])})` }}>{t.settings.appearance.previewHeading}</div>
              <div className="text-[10px] font-mono leading-none" style={{ color: `rgb(${headingColor(HEADING_LEVELS[1])})` }}>{t.settings.appearance.previewSubheading}</div>
              <div className="text-text/80 text-[8px] font-mono leading-relaxed">
                {t.settings.appearance.previewParagraph}
              </div>
              <span className="inline-block text-[8px] text-red font-mono bg-surface-0 border border-border rounded px-1">
                {t.settings.appearance.previewInlineCode}
              </span>
            </div>
          </div>
        </div>

        {/* current selection summary */}
        <div className="text-[11px] font-mono text-text-muted space-y-1 mt-auto">
          <div className="flex justify-between gap-2">
            <span className="text-text-muted/60">{t.settings.appearance.theme}</span>
            <span className="text-text truncate">{theme.label}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-muted/60">{t.settings.appearance.font}</span>
            <span className="text-text truncate">
              {APP_FONTS[effectiveFontId]?.label}
              {fontOverride === null && <span className="text-text-muted/50"> · {t.settings.appearance.summaryTheme}</span>}
            </span>
          </div>
          <div className="flex justify-between gap-2 items-center">
            <span className="text-text-muted/60">{t.settings.appearance.accent}</span>
            <span className="flex items-center gap-1.5 text-text">
              <span className="w-3 h-3 rounded-full border border-border" style={{ background: `rgb(${effectiveAccent})` }} />
              {accentOverride === null ? <span className="text-text-muted/50">{t.settings.appearance.summaryTheme}</span> : t.settings.appearance.summaryCustom}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
