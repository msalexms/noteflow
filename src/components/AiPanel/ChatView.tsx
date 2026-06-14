import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, ArrowUp, Check, History, Loader2, Plus, RefreshCw, Settings, Square, Trash2, Wrench, X } from 'lucide-react'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useSectionHoverPreview } from '../SectionPreview/hoverPreviewContext'
import type { ChatToolActivity } from '../../types'

// Present-continuous labels shown while a tool runs (replaced by its summary once it finishes).
const RUNNING_LABELS: Record<string, string> = {
  list_notes: 'Listing notes…', get_note: 'Reading note…', list_groups: 'Listing groups…',
  search_notes: 'Searching notes…', create_note: 'Creating note…', update_note: 'Updating note…',
  add_section: 'Adding section…', update_section: 'Updating section…', rename_section: 'Renaming section…',
  create_group: 'Creating group…', create_folder: 'Creating folder…', rename_group: 'Renaming group…',
  rename_folder: 'Renaming folder…', delete_note: 'Deleting note…', delete_section: 'Deleting section…',
  delete_group: 'Deleting group…', delete_folder: 'Deleting folder…',
}

const CONFIRM_LABELS: Record<string, string> = {
  delete_note: 'Delete this note permanently?',
  delete_section: 'Delete this section?',
  delete_group: 'Delete this group? Its notes are kept but ungrouped.',
  delete_folder: 'Delete this folder? Its notes keep their group.',
}

function ToolActivityRow({ a }: { a: ChatToolActivity }) {
  const label = a.summary || RUNNING_LABELS[a.name] || a.name
  const icon =
    a.status === 'running' ? <Loader2 size={11} className="animate-spin text-text-muted" />
    : a.status === 'error' ? <AlertTriangle size={11} className="text-red-300" />
    : a.status === 'cancelled' ? <X size={11} className="text-text-muted" />
    : <Check size={11} className="text-emerald-400" />
  return (
    <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-text-muted">
      {icon}
      <span className={`truncate ${a.status === 'cancelled' ? 'line-through opacity-60' : ''}`}>{label}</span>
    </div>
  )
}

export function ChatView({
  onOpenNote,
  onConfigure,
}: {
  onOpenNote: (noteId: string, sectionId: string) => void
  onConfigure: () => void
}) {
  const { previewProps } = useSectionHoverPreview()
  const llmConfig = useAiChatStore((s) => s.llmConfig)
  const presets = useAiChatStore((s) => s.presets)
  const models = useAiChatStore((s) => s.models)
  const modelsLoading = useAiChatStore((s) => s.modelsLoading)
  const refreshModels = useAiChatStore((s) => s.refreshModels)
  const setLlmConfig = useAiChatStore((s) => s.setLlmConfig)
  const messages = useAiChatStore((s) => s.messages)
  const streaming = useAiChatStore((s) => s.streaming)
  const activeSources = useAiChatStore((s) => s.activeSources)
  const sendMessage = useAiChatStore((s) => s.sendMessage)
  const cancel = useAiChatStore((s) => s.cancel)
  const pendingConfirm = useAiChatStore((s) => s.pendingConfirm)
  const confirmAction = useAiChatStore((s) => s.confirmAction)
  const sessions = useAiChatStore((s) => s.sessions)
  const activeSessionId = useAiChatStore((s) => s.activeSessionId)
  const newChat = useAiChatStore((s) => s.newChat)
  const openSession = useAiChatStore((s) => s.openSession)
  const deleteSession = useAiChatStore((s) => s.deleteSession)
  const draft = useAiChatStore((s) => s.draft)
  const setDraft = useAiChatStore((s) => s.setDraft)

  const [historyOpen, setHistoryOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, pendingConfirm])

  // Grow the composer with its content (capped by max-h-32), and shrink it back when cleared.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  const preset = useMemo(() => presets.find((p) => p.id === llmConfig?.active) ?? null, [presets, llmConfig?.active])
  const modelOptions = useMemo(() => {
    const set = new Set<string>([...(preset?.suggestedModels ?? []), ...models])
    if (llmConfig?.model) set.add(llmConfig.model)
    return [...set]
  }, [preset, models, llmConfig?.model])

  const configured = llmConfig?.configured ?? false

  const submit = () => {
    if (!draft.trim() || streaming) return
    sendMessage(draft) // clears the draft in the store
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  if (!configured) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <Settings size={20} className="text-text-muted/60" />
        <p className="text-[12px] font-mono text-text-muted leading-relaxed">
          Connect a model (your Anthropic/OpenAI key or a local Ollama) to chat with your notes.
        </p>
        <button onClick={onConfigure} className="px-3 py-1.5 rounded bg-text text-surface-0 text-[11px] font-mono font-bold hover:opacity-90">
          Configure provider
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Top bar: history + new chat + model picker */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-2 h-9 border-b border-text/10">
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          title="Chat history"
          className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${historyOpen ? 'bg-surface-2 text-text' : 'text-text-muted hover:text-text hover:bg-surface-2'}`}
        >
          <History size={14} />
        </button>
        <button
          onClick={() => { newChat(); setHistoryOpen(false) }}
          title="New chat"
          className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          <Plus size={15} />
        </button>
        <div className="ml-auto flex items-center gap-1 min-w-0">
          <select
            value={llmConfig?.model ?? ''}
            onChange={(e) => setLlmConfig({ model: e.target.value })}
            title="Model used for the next question"
            className="max-w-[150px] bg-surface-0 border border-border rounded px-1.5 py-1 text-[10px] font-mono text-text outline-none focus:border-text/30"
          >
            {modelOptions.length === 0 && <option value="">(no model)</option>}
            {modelOptions.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button
            onClick={() => refreshModels()}
            disabled={modelsLoading}
            title="Load models from provider"
            className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={11} className={modelsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* History overlay */}
      {historyOpen && (
        <>
          <div className="absolute inset-0 z-10" onClick={() => setHistoryOpen(false)} />
          <div className="absolute top-9 left-2 z-20 w-64 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface-1 shadow-2xl py-1">
            {sessions.length === 0 && <p className="px-3 py-2 text-[11px] font-mono text-text-muted/60">No saved chats yet.</p>}
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-1 px-2 py-1.5 hover:bg-text/5 cursor-pointer ${s.id === activeSessionId ? 'bg-surface-2' : ''}`}
                onClick={() => { openSession(s.id); setHistoryOpen(false) }}
              >
                <span className="flex-1 min-w-0 truncate text-[11px] font-mono text-text/80">{s.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                  title="Delete chat"
                  className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-red-300"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-[11px] font-mono text-text-muted/60 text-center mt-6">
            Ask about your notes. I'll light up the ones I use in the brain.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'self-end max-w-[85%]' : 'self-start max-w-[92%]'}>
            {m.role === 'assistant' && m.actions && m.actions.length > 0 && (
              <div className="mb-1 flex flex-col gap-0.5 px-1">
                {m.actions.map((a) => <ToolActivityRow key={a.toolCallId} a={a} />)}
              </div>
            )}
            {(m.role === 'user' || m.content.length > 0 || !m.actions?.length) && (
              <div
                className={`px-2.5 py-1.5 rounded text-[12px] font-mono whitespace-pre-wrap break-words leading-relaxed ${
                  m.role === 'user' ? 'bg-surface-2 text-text' : m.error ? 'bg-red-500/10 text-red-300 border border-red-500/30' : 'text-text/90'
                }`}
              >
                {m.content || (streaming ? '…' : '')}
              </div>
            )}
          </div>
        ))}

        {pendingConfirm && (
          <div className="self-start max-w-[92%] w-full rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-[11.5px] font-mono text-amber-200">
              <Wrench size={12} />
              <span>{CONFIRM_LABELS[pendingConfirm.name] ?? 'Confirm this action?'}</span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => confirmAction(true)}
                className="px-2.5 py-1 rounded bg-red-500/80 text-white text-[11px] font-mono font-bold hover:bg-red-500 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => confirmAction(false)}
                className="px-2.5 py-1 rounded bg-surface-2 text-text text-[11px] font-mono hover:bg-surface-3 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {activeSources.length > 0 && (
          <div className="self-start flex flex-wrap gap-1 mt-0.5">
            {activeSources.map((s) => (
              <button
                key={`${s.noteId}:${s.sectionId}`}
                {...previewProps(s.noteId, s.sectionId)}
                onClick={() => onOpenNote(s.noteId, s.sectionId)}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono border border-border bg-surface-1/60 text-text-muted hover:text-text hover:border-text/30 transition-colors max-w-[160px] truncate"
              >
                {s.title || 'Untitled'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-text/10 p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Type a message…"
            className="flex-1 resize-none bg-surface-0 border border-border rounded px-2 py-1.5 text-[12px] font-mono text-text placeholder-text-muted/40 outline-none focus:border-text/30 max-h-32 overflow-y-auto"
          />
          {streaming ? (
            <button onClick={cancel} title="Stop" className="flex items-center justify-center w-8 h-8 rounded bg-surface-2 text-text hover:bg-surface-3 transition-colors">
              <Square size={13} />
            </button>
          ) : (
            <button onClick={submit} disabled={!draft.trim()} title="Send" className="flex items-center justify-center w-8 h-8 rounded bg-text text-surface-0 disabled:opacity-40 hover:opacity-90 transition-opacity">
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
