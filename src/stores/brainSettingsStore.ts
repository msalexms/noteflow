import { create } from 'zustand'

// Mirrors the legacy flag BrainView already honoured: '1' forces the 2D fallback.
const FORCE_2D_KEY = 'noteflow:brain-force-2d'

interface BrainSettingsState {
  // true  → prefer the immersive 3D render (when WebGL is available)
  // false → always use the lighter 2D canvas
  prefer3D: boolean
  setPrefer3D: (v: boolean) => void
}

export const useBrainSettingsStore = create<BrainSettingsState>((set) => ({
  prefer3D: localStorage.getItem(FORCE_2D_KEY) !== '1',

  setPrefer3D: (v) => {
    if (v) localStorage.removeItem(FORCE_2D_KEY)
    else localStorage.setItem(FORCE_2D_KEY, '1')
    set({ prefer3D: v })
  },
}))
