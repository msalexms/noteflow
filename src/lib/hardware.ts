// Pure hardware-tier detection used to decide whether the Brain view should
// default to the lighter 2D render instead of 3D. Kept dependency-free (no DOM,
// no window) so it runs in node and is unit-testable. The real values come from
// the Electron preload (os module) via window.noteflow.hardware.

export interface HardwareInfo {
  logicalCores: number
  cpuModel: string
  cpuSpeedMHz: number
  totalMemGiB: number
}

// Decide whether real hardware looks low-powered enough to default the Brain view
// to 2D. We flag low-end if ANY of these hold:
//   • RAM ≤ 4.5 GiB — genuinely memory-constrained.
//   • ≤ 4 logical cores — few threads to spare for a 3D scene.
//   • Parsed base clock < 2.0 GHz — low-power/ULV silicon even if it has many
//     threads. We parse the base clock from the model string ("... @ 1.60GHz")
//     because cpuSpeedMHz (os.cpus().speed) reports a fluctuating *current*
//     frequency on Linux, not the nominal base clock, so it's unreliable here.
//   • The model looks like a low-power laptop part (Intel U/Y suffix e.g. 8250U,
//     AMD U-series e.g. 4700U). These throttle hard and pair with weak iGPUs even
//     when core/thread counts look fine (e.g. 4C/8T).
// The clock/ULV signals are what catch machines the coarse RAM/core checks miss
// (e.g. an i5-8250U: 8 logical threads, ~8 GB) without falsely flagging a
// high-clock desktop chip with plenty of RAM.
export function isLowEndHardware(hw: HardwareInfo): boolean {
  if (hw.totalMemGiB <= 4.5) return true
  if (hw.logicalCores > 0 && hw.logicalCores <= 4) return true

  const baseClockGHz = parseBaseClockGHz(hw.cpuModel)
  if (baseClockGHz !== null && baseClockGHz < 2.0) return true

  if (isUlvLaptopChip(hw.cpuModel)) return true

  return false
}

// Base clock advertised in the model string, e.g.
// "Intel(R) Core(TM) i5-8250U CPU @ 1.60GHz" → 1.6.
export function parseBaseClockGHz(model: string): number | null {
  const m = model.match(/@\s*([\d.]+)\s*GHz/i)
  return m ? parseFloat(m[1]) : null
}

// Low-power laptop silicon: Intel mobile U/Y suffix (e.g. 8250U) and AMD mobile
// U-series (e.g. 4700U). Kept conservative to avoid matching unrelated numbers.
export function isUlvLaptopChip(model: string): boolean {
  return /\b\d{3,5}[UY]\b/i.test(model) || /\b\d{3,4}U\b/i.test(model)
}
