import { create } from 'zustand'
import type { AiSettings, RelatedNote, IndexState, IndexProgress } from '../types'

// Per-key debounce for related lookups — avoids querying on every keystroke save.
const relatedTimers = new Map<string, ReturnType<typeof setTimeout>>()
const RELATED_DEBOUNCE_MS = 1500

// Related results are keyed by note + active section (each tab has its own topic).
const relKey = (noteId: string, sectionId: string) => `${noteId}::${sectionId}`

interface AiState {
  loaded: boolean
  enabled: boolean
  modelId: string
  indexState: IndexState
  progress: IndexProgress | null
  relatedByKey: Record<string, RelatedNote[]>

  loadAiSettings: () => Promise<void>
  setEnabled: (value: boolean) => Promise<void>
  reindexAll: () => Promise<void>
  fetchRelated: (noteId: string, sectionId: string) => void
  getRelated: (noteId: string, sectionId: string) => RelatedNote[] | undefined
  initListeners: () => () => void
}

export const useAiStore = create<AiState>((set, get) => ({
  loaded: false,
  enabled: false,
  modelId: '',
  indexState: 'idle',
  progress: null,
  relatedByKey: {},

  loadAiSettings: async () => {
    try {
      const s = await window.noteflow.getAiSettings()
      set({ enabled: s.enabled, modelId: s.modelId, loaded: true })
    } catch (err) {
      console.error('Failed to load AI settings:', err)
      set({ loaded: true })
    }
  },

  setEnabled: async (value) => {
    const next: AiSettings = await window.noteflow.setAiSettings({ enabled: value })
    set({ enabled: next.enabled, modelId: next.modelId })
    if (!value) set({ relatedByKey: {}, progress: null, indexState: 'idle' })
  },

  reindexAll: async () => {
    try { await window.noteflow.aiReindexAll() } catch (err) { console.error('Reindex failed:', err) }
  },

  getRelated: (noteId, sectionId) => get().relatedByKey[relKey(noteId, sectionId)],

  fetchRelated: (noteId, sectionId) => {
    if (!get().enabled || !noteId || !sectionId) return
    const key = relKey(noteId, sectionId)
    const existing = relatedTimers.get(key)
    if (existing) clearTimeout(existing)
    relatedTimers.set(key, setTimeout(async () => {
      relatedTimers.delete(key)
      try {
        const related = await window.noteflow.aiRelated(noteId, sectionId)
        set((st) => ({ relatedByKey: { ...st.relatedByKey, [key]: related } }))
      } catch (err) {
        console.error('Failed to fetch related notes:', err)
      }
    }, RELATED_DEBOUNCE_MS))
  },

  initListeners: () => {
    const offProgress = window.noteflow.onAiReindexProgress((progress) => set({ progress }))
    const offState = window.noteflow.onAiIndexState((indexState) => {
      set({ indexState })
      // When a (re)index finishes, drop cached related results so panels refetch fresh.
      if (indexState === 'idle') set({ relatedByKey: {} })
    })
    return () => { offProgress(); offState() }
  },
}))
