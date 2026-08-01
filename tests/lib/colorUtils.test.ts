import { describe, it, expect } from 'vitest'
import { hexToRgbChannels, hexToRgbTriple, rgbTripleToHex } from '../../src/lib/colorUtils'

describe('hexToRgbChannels', () => {
  it('parses full and shorthand hex', () => {
    expect(hexToRgbChannels('#7aa2f7')).toEqual([122, 162, 247])
    expect(hexToRgbChannels('#7AA2F7')).toEqual([122, 162, 247])
    expect(hexToRgbChannels('#abc')).toEqual([170, 187, 204])
  })

  it('degrades to black on junk', () => {
    expect(hexToRgbChannels('#zzzzzz')).toEqual([0, 0, 0])
  })
})

describe('hexToRgbTriple', () => {
  it('formats the CSS-var channel triple', () => {
    expect(hexToRgbTriple('#7aa2f7')).toBe('122 162 247')
  })
})

describe('rgbTripleToHex', () => {
  it('round-trips a channel triple', () => {
    expect(rgbTripleToHex('122 162 247')).toBe('#7aa2f7')
    expect(rgbTripleToHex('  122 162 247  ')).toBe('#7aa2f7')
    expect(rgbTripleToHex('122, 162, 247')).toBe('#7aa2f7')
  })

  it('clamps out-of-range channels and pads', () => {
    expect(rgbTripleToHex('0 0 0')).toBe('#000000')
    expect(rgbTripleToHex('300 -20 5')).toBe('#ff0005')
  })
})
