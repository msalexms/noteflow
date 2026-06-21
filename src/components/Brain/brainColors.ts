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

/**
 * Palette for the brain canvas: the live theme, used as-is for both dark and light themes.
 *
 * The brain used to force dark neutrals under light themes (the additive glow/bloom look was
 * built for a dark backdrop). That left an out-of-place dark slate panel in an otherwise light
 * app. Instead the renderers now adapt to a light bg directly — on light themes the wireframe
 * falls back to normal blending with raised opacity floors and the node hues come straight from
 * the theme (the light themes already define accents "deepened for contrast on parchment"), so
 * the same colours simply read darker against the light background. See BrainScene/BrainCanvas.
 */
export function readBrainPalette(): BrainPalette {
  return readPalette()
}
