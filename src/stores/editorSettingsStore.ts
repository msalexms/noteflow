import { create } from 'zustand'

const STORAGE_KEY = 'noteflow-font-size'
const DEFAULT_SIZE = 13

interface EditorSettingsState {
  fontSize: number
  setFontSize: (size: number) => void
  changeFontSize: (delta: number) => void
  resetFontSize: () => void
}

export const useEditorSettingsStore = create<EditorSettingsState>((set, get) => ({
  fontSize: parseInt(localStorage.getItem(STORAGE_KEY) ?? String(DEFAULT_SIZE)),

  setFontSize: (size) => {
    const clamped = Math.min(24, Math.max(10, size))
    localStorage.setItem(STORAGE_KEY, String(clamped))
    set({ fontSize: clamped })
  },

  changeFontSize: (delta) => get().setFontSize(get().fontSize + delta),

  resetFontSize: () => get().setFontSize(DEFAULT_SIZE),
}))
