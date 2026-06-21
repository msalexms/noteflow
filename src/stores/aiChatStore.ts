import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { splitSuggestions } from '../lib/chatSuggestions'
import type { LlmConfigPublic, LlmPreset, ChatMessage, ChatSource, ChatSession, ChatToolActivity, ChatPendingConfirm, ChatAttachment } from '../types'

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: boolean
  actions?: ChatToolActivity[]
  attachments?: ChatAttachment[]
}

/** Tabs of the AI panel — shared so the command palette can route to one. */
export type PanelTab = 'chat' | 'related' | 'profile' | 'settings'

interface LlmConfigPatch {
  active?: string
  model?: string
  baseUrl?: string
  apiKey?: string
  clearKey?: boolean
}

interface AiChatState {
  // ── LLM provider config ──
  llmConfig: LlmConfigPublic | null
  presets: LlmPreset[]
  configLoaded: boolean
  models: string[] // fetched models for the active provider (merged with suggested in the UI)
  modelsLoading: boolean
  loadConfig: () => Promise<void>
  setLlmConfig: (patch: LlmConfigPatch) => Promise<LlmConfigPublic>
  refreshModels: () => Promise<{ ok: boolean; error?: string }>
  testConnection: () => Promise<{ ok: boolean; error?: string }>

  // ── Chat ──
  draft: string // composer text, kept here so it survives ChatView unmount/remount
  setDraft: (text: string) => void
  pendingAttachments: ChatAttachment[] // files picked for the next message (bytes live in main)
  pickAttachments: () => Promise<void>
  removeAttachment: (id: string) => void
  messages: ChatTurn[]
  streaming: boolean
  currentRequestId: string | null
  activeSources: ChatSource[]
  pendingConfirm: ChatPendingConfirm | null
  suggestions: string[] // next-action prompts parsed from the last assistant reply
  sendMessage: (text: string) => void
  cancel: () => void
  confirmAction: (approved: boolean) => void

  // ── Sessions (history) ──
  sessions: ChatSession[]
  activeSessionId: string | null
  loadSessions: () => Promise<void>
  newChat: () => void
  openSession: (id: string) => void
  deleteSession: (id: string) => void

  // ── AI panel routing (driven by the command palette) ──
  panelTab: PanelTab | null      // requested initial tab — consumed by AiPanel
  pendingPrompt: string | null   // a question to auto-send once chat is ready — consumed by ChatView
  openAiPanel: (tab: PanelTab, prompt?: string) => void

  initListeners: () => () => void
}

export const useAiChatStore = create<AiChatState>((set, get) => ({
  llmConfig: null,
  presets: [],
  configLoaded: false,
  models: [],
  modelsLoading: false,

  loadConfig: async () => {
    try {
      const [cfg, presets] = await Promise.all([window.noteflow.aiLlmGetConfig(), window.noteflow.aiLlmPresets()])
      set({ llmConfig: cfg, presets, configLoaded: true })
    } catch (err) {
      console.error('Failed to load LLM config:', err)
      set({ configLoaded: true })
    }
  },

  setLlmConfig: async (patch) => {
    const switching = patch.active !== undefined && patch.active !== get().llmConfig?.active
    const cfg = await window.noteflow.aiLlmSetConfig(patch)
    set({ llmConfig: cfg, ...(switching ? { models: [] } : {}) })
    // Saving an API key (or switching to a configured provider) — load the provider's
    // models automatically so the user doesn't have to hit the refresh button.
    if ((patch.apiKey || switching) && cfg.configured) void get().refreshModels()
    return cfg
  },

  refreshModels: async () => {
    set({ modelsLoading: true })
    const res = await window.noteflow.aiLlmListModels()
    set({ modelsLoading: false, models: res.ok ? res.models : [] })
    return { ok: res.ok, error: res.error }
  },

  testConnection: () => window.noteflow.aiLlmTest(),

  // ── Chat ──
  draft: '',
  setDraft: (text) => set({ draft: text }),
  pendingAttachments: [],

  pickAttachments: async () => {
    const res = await window.noteflow.aiChatPickFiles()
    if (!res.ok || !res.files) return
    set((s) => {
      const seen = new Set(s.pendingAttachments.map((a) => a.id))
      return { pendingAttachments: [...s.pendingAttachments, ...res.files!.filter((f) => !seen.has(f.id))] }
    })
  },

  removeAttachment: (id) => {
    void window.noteflow.aiChatRemoveFile(id)
    set((s) => ({ pendingAttachments: s.pendingAttachments.filter((a) => a.id !== id) }))
  },

  messages: [],
  streaming: false,
  currentRequestId: null,
  activeSources: [],
  pendingConfirm: null,
  suggestions: [],

  sendMessage: (text) => {
    const trimmed = text.trim()
    const atts = get().pendingAttachments
    if ((!trimmed && atts.length === 0) || get().streaming) return
    const requestId = nanoid()
    const userTurn: ChatTurn = { id: nanoid(), role: 'user', content: trimmed, ...(atts.length ? { attachments: atts } : {}) }
    const assistantTurn: ChatTurn = { id: nanoid(), role: 'assistant', content: '' }
    const history = get().messages
    set({
      messages: [...history, userTurn, assistantTurn],
      streaming: true,
      currentRequestId: requestId,
      activeSources: [],
      suggestions: [],
      draft: '',
      pendingAttachments: [],
    })
    // Re-send every turn's attachment ids so follow-up questions keep their files in context.
    const payload: ChatMessage[] = [...history, userTurn].map((m) => ({
      role: m.role, content: m.content, ...(m.attachments?.length ? { attachmentIds: m.attachments.map((a) => a.id) } : {}),
    }))
    window.noteflow.aiChat(requestId, payload).catch((err) => console.error('aiChat failed:', err))
  },

  cancel: () => {
    const id = get().currentRequestId
    if (id) window.noteflow.aiChatCancel(id)
    set({ streaming: false, currentRequestId: null, pendingConfirm: null })
  },

  confirmAction: (approved) => {
    const pc = get().pendingConfirm
    if (!pc) return
    window.noteflow.aiChatConfirm(pc.toolCallId, approved)
    set({ pendingConfirm: null })
  },

  // ── Sessions ──
  sessions: [],
  activeSessionId: null,

  loadSessions: async () => {
    try {
      const sessions = await window.noteflow.aiChatsLoad()
      set({ sessions })
    } catch (err) {
      console.error('Failed to load chat history:', err)
    }
  },

  newChat: () => {
    if (get().streaming) get().cancel()
    for (const a of get().pendingAttachments) void window.noteflow.aiChatRemoveFile(a.id)
    set({ messages: [], activeSources: [], activeSessionId: null, pendingConfirm: null, pendingAttachments: [], suggestions: [] })
  },

  openSession: (id) => {
    if (get().streaming) get().cancel()
    const s = get().sessions.find((x) => x.id === id)
    if (!s) return
    set({ messages: s.messages.map((m) => ({ ...m })), activeSessionId: id, activeSources: [], suggestions: [] })
  },

  deleteSession: (id) => {
    const sessions = get().sessions.filter((s) => s.id !== id)
    set({ sessions, ...(get().activeSessionId === id ? { messages: [], activeSessionId: null, activeSources: [] } : {}) })
    void window.noteflow.aiChatsSave(sessions)
  },

  // ── AI panel routing ──
  panelTab: null,
  pendingPrompt: null,

  openAiPanel: (tab, prompt) => {
    const trimmed = prompt?.trim()
    if (trimmed) {
      // Land the question in a clean conversation so it isn't tacked onto an old thread.
      get().newChat()
      set({ panelTab: 'chat', pendingPrompt: trimmed })
    } else {
      set({ panelTab: tab })
    }
  },

  initListeners: () => {
    const appendToAssistant = (delta: string) => {
      set((s) => {
        const msgs = s.messages.slice()
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + delta }
        return { messages: msgs }
      })
    }

    // Persist the current conversation into the sessions list (create or update).
    const persist = () => {
      const msgs = get().messages
      if (msgs.length === 0) return
      const now = new Date().toISOString()
      const title = (msgs.find((m) => m.role === 'user')?.content ?? 'Chat').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Chat'
      let id = get().activeSessionId
      let sessions = get().sessions.slice()
      if (!id) {
        id = nanoid()
        sessions = [{ id, title, createdAt: now, updatedAt: now, messages: msgs }, ...sessions]
        set({ activeSessionId: id })
      } else {
        const sid = id
        sessions = sessions.map((s) => (s.id === sid ? { ...s, updatedAt: now, messages: msgs } : s))
      }
      set({ sessions })
      void window.noteflow.aiChatsSave(sessions)
    }

    // Mutate the actions array on the latest assistant turn.
    const updateActions = (fn: (actions: ChatToolActivity[]) => ChatToolActivity[]) => {
      set((s) => {
        const msgs = s.messages.slice()
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant') msgs[msgs.length - 1] = { ...last, actions: fn(last.actions ?? []) }
        return { messages: msgs }
      })
    }

    const offDelta = window.noteflow.onAiChatDelta((p) => {
      if (p.requestId !== get().currentRequestId) return
      appendToAssistant(p.delta)
    })
    const offSources = window.noteflow.onAiChatSources((p) => {
      if (p.requestId !== get().currentRequestId) return
      set({ activeSources: p.sources })
    })
    const offToolCall = window.noteflow.onAiChatToolCall((p) => {
      if (p.requestId !== get().currentRequestId) return
      updateActions((actions) =>
        actions.some((a) => a.toolCallId === p.toolCallId)
          ? actions
          : [...actions, { toolCallId: p.toolCallId, name: p.name, status: 'running' }])
    })
    const offToolResult = window.noteflow.onAiChatToolResult((p) => {
      if (p.requestId !== get().currentRequestId) return
      updateActions((actions) =>
        actions.map((a) => a.toolCallId === p.toolCallId ? { ...a, status: p.status, summary: p.summary } : a))
    })
    const offConfirm = window.noteflow.onAiChatConfirmRequest((p) => {
      if (p.requestId !== get().currentRequestId) return
      set({ pendingConfirm: p })
    })
    const offDone = window.noteflow.onAiChatDone((p) => {
      if (p.requestId !== get().currentRequestId) return
      // Pull the trailing suggestion block out of the final assistant turn: strip it from
      // the stored content (so saved history stays clean) and surface it as chips.
      let suggestions: string[] = []
      set((s) => {
        const msgs = s.messages.slice()
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant' && !last.error) {
          const split = splitSuggestions(last.content)
          suggestions = split.suggestions
          if (split.visible !== last.content) msgs[msgs.length - 1] = { ...last, content: split.visible }
        }
        return { messages: msgs, streaming: false, currentRequestId: null, pendingConfirm: null, suggestions }
      })
      persist()
    })
    const offError = window.noteflow.onAiChatError((p) => {
      if (p.requestId !== get().currentRequestId) return
      set((s) => {
        const msgs = s.messages.slice()
        const last = msgs[msgs.length - 1]
        if (last && last.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content || `⚠ ${p.error}`, error: true }
        return { messages: msgs, streaming: false, currentRequestId: null, pendingConfirm: null, suggestions: [] }
      })
      persist()
    })

    return () => { offDelta(); offSources(); offToolCall(); offToolResult(); offConfirm(); offDone(); offError() }
  },
}))
