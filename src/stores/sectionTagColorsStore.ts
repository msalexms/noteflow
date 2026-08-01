import { create } from 'zustand'
import { normalizeGroupColor, normalizeTagColorKey } from '../lib/tagColors'
import type { GroupColor } from '../types'

export type SectionTagColorMap = Record<string, GroupColor>

function sanitizeSectionTagColors(raw: unknown): SectionTagColorMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const next: SectionTagColorMap = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedKey = normalizeTagColorKey(key)
    const color = normalizeGroupColor(value)
    if (!normalizedKey || !color) continue
    next[normalizedKey] = color
  }
  return next
}

interface SectionTagColorsState {
  sectionTagColors: SectionTagColorMap
  loadSectionTagColors: () => Promise<void>
  setSectionTagColor: (sectionName: string, color: GroupColor) => Promise<void>
  clearSectionTagColor: (sectionName: string) => Promise<void>
}

export const useSectionTagColorsStore = create<SectionTagColorsState>((set, get) => ({
  sectionTagColors: {},

  loadSectionTagColors: async () => {
    const raw = await window.noteflow.getSectionTagColors()
    set({ sectionTagColors: sanitizeSectionTagColors(raw) })
  },

  setSectionTagColor: async (sectionName, color) => {
    const key = normalizeTagColorKey(sectionName)
    const value = normalizeGroupColor(color)
    if (!key || !value) return

    const next = { ...get().sectionTagColors, [key]: value }
    set({ sectionTagColors: next })
    await window.noteflow.setSectionTagColors(next)
  },

  clearSectionTagColor: async (sectionName) => {
    const key = normalizeTagColorKey(sectionName)
    if (!key) return

    const current = get().sectionTagColors
    if (!(key in current)) return

    const next = { ...current }
    delete next[key]
    set({ sectionTagColors: next })
    await window.noteflow.setSectionTagColors(next)
  },
}))
