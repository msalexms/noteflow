// The canvas renderer can't use CSS classes, so it resolves the theme's CSS variables
// (stored on :root as space-separated RGB triples, e.g. "122 162 247") to real numbers.
// Read a fresh palette whenever the theme changes (keyed on activeThemeId in BrainCanvas).

export type RGB = [number, number, number]

export function readVar(name: string): RGB {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const parts = raw.split(/[\s,]+/).map(Number)
  if (parts.length >= 3 && parts.every((n) => !Number.isNaN(n))) {
    return [parts[0], parts[1], parts[2]]
  }
  return [128, 128, 128]
}

export function rgba([r, g, b]: RGB, a = 1): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export interface BrainPalette {
  bg: RGB
  panel: RGB
  text: RGB
  textMuted: RGB
  border: RGB
  /** Resolve any group/tag CSS var (e.g. '--accent') to its RGB, cached. */
  color: (cssVar: string) => RGB
}

export function readPalette(): BrainPalette {
  const cache = new Map<string, RGB>()
  const color = (cssVar: string): RGB => {
    let c = cache.get(cssVar)
    if (!c) { c = readVar(cssVar); cache.set(cssVar, c) }
    return c
  }
  return {
    bg: readVar('--bg-editor'),
    panel: readVar('--bg-1'),
    text: readVar('--text'),
    textMuted: readVar('--text-muted'),
    border: readVar('--border'),
    color,
  }
}

const luminance = ([r, g, b]: RGB) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

// Fixed dark neutrals for the brain when the active theme is light. The whole brain look
// (additive glow + bloom + HDR-boosted node colours) is built for a dark backdrop: on a light
// bg the additive synapses/halos vanish into the white and the nodes wash out. So we keep the
// theme's accent/group hues (groups stay the same colour as in the sidebar) but swap the
// neutrals for a dark slate. The DOM overlay (header, labels, cards) mirrors these via the
// `.brain-dark` CSS class so it stays legible over the dark canvas.
const DARK_BG: RGB = [16, 18, 27]
const DARK_PANEL: RGB = [18, 20, 30]
const DARK_INK: RGB = [206, 214, 240]
const DARK_INK_MUTED: RGB = [120, 132, 170]
const DARK_BORDER: RGB = [44, 49, 70]

/** Palette for the brain canvas: the live theme, but with neutrals forced dark on light themes. */
export function readBrainPalette(): BrainPalette {
  const base = readPalette()
  if (luminance(base.bg) < 0.5) return base // already dark — use the theme as-is
  const baseColor = base.color
  return {
    bg: DARK_BG,
    panel: DARK_PANEL,
    text: DARK_INK,
    textMuted: DARK_INK_MUTED,
    border: DARK_BORDER,
    // Keep accent/group hues; only the neutral '--text' (ungrouped nodes, synapses) goes light
    // so it reads against the dark backdrop instead of inheriting the theme's dark ink.
    color: (cssVar) => (cssVar === '--text' ? DARK_INK : baseColor(cssVar)),
  }
}
