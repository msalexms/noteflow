// Shared RGB ↔ hex conversions.
// Theme CSS vars hold colours as space-separated channel triples ("122 162 247") so they can be
// composed with alpha (`rgb(var(--accent) / 0.2)`); the native `<input type="color">` speaks
// '#rrggbb'. These helpers bridge both worlds.

/** '#7aa2f7' → [122, 162, 247]. Invalid input degrades to black. */
export function hexToRgbChannels(hex: string): [number, number, number] {
  const m = hex.trim().replace('#', '')
  const full = m.length === 3 ? `${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}` : m
  const n = parseInt(full.slice(0, 6), 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** '#7aa2f7' → '122 162 247' (the CSS-var channel format). */
export function hexToRgbTriple(hex: string): string {
  return hexToRgbChannels(hex).join(' ')
}

/** '122 162 247' → '#7aa2f7'. Accepts comma-separated triples too. */
export function rgbTripleToHex(rgb: string): string {
  const [r, g, b] = rgb.trim().split(/[\s,]+/).map(Number)
  const h = (n: number) => Math.max(0, Math.min(255, n || 0)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}
