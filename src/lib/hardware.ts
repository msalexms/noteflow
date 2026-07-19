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
// to 2D.
//
// HARD signals — any of these alone flags low-end:
//   • RAM ≤ 4.5 GiB — genuinely memory-constrained.
//   • ≤ 4 logical cores — few threads to spare for a 3D scene.
//
// WEAK signals — only count on an otherwise MODEST machine (see the gate below),
// because on their own they misfire on modern laptops:
//   • Parsed base clock < 2.0 GHz. We parse it from the model string
//     ("... @ 1.60GHz") because cpuSpeedMHz (os.cpus().speed) reports a
//     fluctuating *current* frequency on Linux, not the nominal base clock. A low
//     advertised base clock says little by itself: recent parts (e.g. i7-1355U
//     "@ 1.70GHz") boost way past it.
//   • The model looks like a low-power laptop part (Intel U/Y suffix e.g. 8250U,
//     AMD U-series e.g. 4700U). Older ULV chips throttle hard and pair with weak
//     iGPUs, but a current ULV (e.g. Ryzen 7 7840U, 16 threads / 16 GiB) renders
//     the 3D brain fine.
//
// MODEST gate: ≤ 8 logical cores AND ≤ 8.5 GiB RAM. Inside it a low base clock or
// a ULV model tips the machine to 2D — that's what catches the i5-8250U class
// (4C/8T, ~7.7 GiB) that the coarse RAM/core checks miss — while a well-specced
// laptop or desktop keeps 3D regardless of its clock string or U suffix.
export function isLowEndHardware(hw: HardwareInfo): boolean {
  if (hw.totalMemGiB <= 4.5) return true
  if (hw.logicalCores > 0 && hw.logicalCores <= 4) return true

  const isModestMachine = hw.logicalCores <= 8 && hw.totalMemGiB <= 8.5
  if (!isModestMachine) return false

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
