import { create } from 'zustand'
import type { AiSettings, RelatedNote, IndexState, IndexProgress, GraphEdge } from '../types'

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
  // Notes changed since the last completed index — results are out of date until the
  // incremental indexer catches up (clears itself on the next 'idle').
  stale: boolean
  progress: IndexProgress | null
  relatedByKey: Record<string, RelatedNote[]>
  graphEdges: GraphEdge[]
  graphLoading: boolean

  loadAiSettings: () => Promise<void>
  setEnabled: (value: boolean) => Promise<void>
  reindexAll: () => Promise<void>
  fetchRelated: (noteId: string, sectionId: string) => void
  getRelated: (noteId: string, sectionId: string) => RelatedNote[] | undefined
  fetchGraphEdges: () => Promise<void>
  initListeners: () => () => void
}

export const useAiStore = create<AiState>((set, get) => ({
  loaded: false,
  enabled: false,
  modelId: '',
  indexState: 'idle',
  stale: false,
  progress: null,
  relatedByKey: {},
  graphEdges: [],
  graphLoading: false,

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
    if (!value) set({ relatedByKey: {}, graphEdges: [], progress: null, indexState: 'idle', stale: false })
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

  fetchGraphEdges: async () => {
    if (!get().enabled) { set({ graphEdges: [] }); return }
    set({ graphLoading: true })
    try {
      const edges = await window.noteflow.aiGraph()
      set({ graphEdges: edges, graphLoading: false })
    } catch (err) {
      console.error('Failed to fetch graph edges:', err)
      set({ graphLoading: false })
    }
  },

  initListeners: () => {
    const offProgress = window.noteflow.onAiReindexProgress((progress) => set({ progress }))
    const offState = window.noteflow.onAiIndexState((indexState) => {
      set({ indexState })
      // When a (re)index finishes, the index is up to date again: clear the stale flag,
      // drop cached related results so panels refetch fresh, and refresh the brain
      // graph's content edges if it's open.
      if (indexState === 'idle') {
        set({ relatedByKey: {}, stale: false })
        if (get().enabled) void get().fetchGraphEdges()
      }
    })
    // A note changed on disk → the on-disk index no longer matches the latest content until
    // the incremental indexer (re)runs. Only relevant while AI is on.
    const offNotes = window.noteflow.onNotesUpdated(() => {
      if (get().enabled) set({ stale: true })
    })
    return () => { offProgress(); offState(); offNotes() }
  },
}))
