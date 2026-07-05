import { describe, it, expect } from 'vitest'
import {
  isLowEndHardware,
  parseBaseClockGHz,
  isUlvLaptopChip,
  type HardwareInfo,
} from '../../src/lib/hardware'

describe('parseBaseClockGHz', () => {
  it('reads the base clock from an Intel model string', () => {
    expect(parseBaseClockGHz('Intel(R) Core(TM) i5-8250U CPU @ 1.60GHz')).toBe(1.6)
  })
  it('handles spacing and case variants', () => {
    expect(parseBaseClockGHz('Something @2.90 ghz')).toBe(2.9)
  })
  it('returns null when no clock is advertised', () => {
    expect(parseBaseClockGHz('Apple M1')).toBeNull()
    expect(parseBaseClockGHz('')).toBeNull()
  })
})

describe('isUlvLaptopChip', () => {
  it('matches Intel U/Y mobile suffixes', () => {
    expect(isUlvLaptopChip('Intel(R) Core(TM) i5-8250U CPU @ 1.60GHz')).toBe(true)
    expect(isUlvLaptopChip('Intel(R) Core(TM) i7-1065G7')).toBe(false) // G7, not U/Y
    expect(isUlvLaptopChip('Intel(R) Core(TM) m3-8100Y')).toBe(true)
  })
  it('matches AMD U-series mobile', () => {
    expect(isUlvLaptopChip('AMD Ryzen 7 4700U')).toBe(true)
  })
  it('does not match desktop parts', () => {
    expect(isUlvLaptopChip('Intel(R) Core(TM) i7-12700K')).toBe(false)
    expect(isUlvLaptopChip('AMD Ryzen 9 5900X')).toBe(false)
  })
})

describe('isLowEndHardware', () => {
  // The machine this feature targets: 4C/8T ULV laptop chip with ~7.7 GiB RAM.
  it('flags an Intel i5-8250U laptop (8 threads, 7.7 GiB) as low-end', () => {
    const hw: HardwareInfo = {
      logicalCores: 8,
      cpuModel: 'Intel(R) Core(TM) i5-8250U CPU @ 1.60GHz',
      cpuSpeedMHz: 800,
      totalMemGiB: 7.7,
    }
    expect(isLowEndHardware(hw)).toBe(true)
  })

  it('flags low RAM', () => {
    const hw: HardwareInfo = {
      logicalCores: 8,
      cpuModel: 'Some Desktop CPU @ 3.50GHz',
      cpuSpeedMHz: 3500,
      totalMemGiB: 4,
    }
    expect(isLowEndHardware(hw)).toBe(true)
  })

  it('flags few cores', () => {
    const hw: HardwareInfo = {
      logicalCores: 4,
      cpuModel: 'Some CPU @ 3.00GHz',
      cpuSpeedMHz: 3000,
      totalMemGiB: 16,
    }
    expect(isLowEndHardware(hw)).toBe(true)
  })

  it('flags a low base clock even with many threads and RAM', () => {
    const hw: HardwareInfo = {
      logicalCores: 8,
      cpuModel: 'Generic CPU @ 1.80GHz',
      cpuSpeedMHz: 1800,
      totalMemGiB: 16,
    }
    expect(isLowEndHardware(hw)).toBe(true)
  })

  it('does NOT flag a high-clock desktop chip with plenty of RAM', () => {
    const hw: HardwareInfo = {
      logicalCores: 16,
      cpuModel: 'Intel(R) Core(TM) i7-12700K @ 3.60GHz',
      cpuSpeedMHz: 3600,
      totalMemGiB: 32,
    }
    expect(isLowEndHardware(hw)).toBe(false)
  })

  it('does NOT flag a generic 8-thread / 8 GiB machine on core/RAM alone', () => {
    // Only the clock/ULV signals should push borderline machines to 2D, not a
    // plain 8-thread/8 GiB reading with a healthy clock.
    const hw: HardwareInfo = {
      logicalCores: 8,
      cpuModel: 'Generic CPU @ 3.20GHz',
      cpuSpeedMHz: 3200,
      totalMemGiB: 8,
    }
    expect(isLowEndHardware(hw)).toBe(false)
  })
})
