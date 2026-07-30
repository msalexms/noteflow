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
  // Notes the index hasn't caught up with yet — results are out of date until it does. Owned by
  // main (it knows what actually got indexed); this is just the last value it reported.
  stale: boolean
  staleCount: number
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
  staleCount: 0,
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
    if (!value) set({ relatedByKey: {}, graphEdges: [], progress: null, indexState: 'idle', stale: false, staleCount: 0 })
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
      const wasIndexing = get().indexState === 'indexing'
      set({ indexState })
      // Only a real 'indexing' → 'idle' transition means fresh vectors landed: drop cached related
      // results so panels refetch, and refresh the brain graph's edges if it's open. Bare 'idle's
      // (worker boot, model unload) index nothing and must not trigger a refetch.
      if (indexState === 'idle' && wasIndexing) {
        set({ relatedByKey: {} })
        if (get().enabled) void get().fetchGraphEdges()
      }
    })
    // Staleness comes from main, which tracks what actually reached the index (and persists it,
    // so edits made while the AI worker was dormant still show up after a restart).
    let gotStaleEvent = false
    const offStale = window.noteflow.onAiIndexStale((info) => {
      gotStaleEvent = true
      set({ stale: info.stale, staleCount: info.count })
    })
    window.noteflow.aiGetStale()
      .then((info) => { if (!gotStaleEvent) set({ stale: info.stale, staleCount: info.count }) })
      .catch((err) => console.error('Failed to read AI index staleness:', err))
    return () => { offProgress(); offState(); offStale() }
  },
}))
