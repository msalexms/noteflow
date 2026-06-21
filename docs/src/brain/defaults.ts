import type { BrainShapeParams } from './mesh'

// Render-side knobs that don't rebuild the mesh (updated live on the materials/bloom/fog).
export interface LookParams {
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  wireOpacity: number
  dotSize: number
  dotOpacity: number
  fogNear: number
  fogFar: number
  bgDarken: number  // 0 = true theme bg, 1 = black
}

export const DEFAULT_LOOK: LookParams = {
  bloomStrength: 0.28,
  bloomRadius: 0.3,
  bloomThreshold: 0.25,
  wireOpacity: 0.06,
  dotSize: 0.02,
  dotOpacity: 0.38,
  fogNear: 4.5,
  fogFar: 10,
  bgDarken: 0,
}

// Click-sculpt tool state (lives in BrainScene; the tuner renders its controls).
export type SculptTool = 'raise' | 'lower' | 'density'
export interface SculptSettings {
  enabled: boolean
  tool: SculptTool
  radius: number    // angular falloff (radians)
  strength: number  // bulge raise/lower amount
  level: number     // extra subdivision levels for the density brush
}
export const DEFAULT_SCULPT: SculptSettings = { enabled: false, tool: 'raise', radius: 0.5, strength: 0.15, level: 1 }

// Bumped to v2 when the default look changed; the user's final shape is baked into
// DEFAULT_BRAIN_PARAMS, so dropping the old saved state loses nothing.
const STORE_KEY = 'noteflow:brain-tuner-v2'
export interface TunerState { shape: BrainShapeParams; look: LookParams }

export function loadTuner(): TunerState | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.shape && parsed?.look) return parsed as TunerState
  } catch { /* ignore */ }
  return null
}
export function saveTuner(s: TunerState) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}
