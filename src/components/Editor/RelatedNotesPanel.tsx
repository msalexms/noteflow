import { useEffect, useState } from 'react'
import { Brain, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useAiStore } from '../../stores/aiStore'
import { useNotesStore } from '../../stores/notesStore'

interface RelatedNotesPanelProps {
  noteId: string
  activeSectionId: string | null
  activeSectionName: string
  noteUpdated: string  // changes on every edit → triggers a debounced refetch
  encrypted: boolean
}

const COLLAPSE_KEY = 'noteflow:related-panel-collapsed'

export function RelatedNotesPanel({ noteId, activeSectionId, activeSectionName, noteUpdated, encrypted }: RelatedNotesPanelProps) {
  const enabled = useAiStore((s) => s.enabled)
  const indexState = useAiStore((s) => s.indexState)
  const related = useAiStore((s) => (activeSectionId ? s.relatedByKey[`${noteId}::${activeSectionId}`] : undefined))
  const fetchRelated = useAiStore((s) => s.fetchRelated)
  const setActiveNote = useNotesStore((s) => s.setActiveNote)

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')

  useEffect(() => {
    if (!enabled || encrypted || !activeSectionId) return
    fetchRelated(noteId, activeSectionId)
  }, [enabled, encrypted, noteId, activeSectionId, noteUpdated, fetchRelated])

  // Hidden unless AI is on, the note is readable, and we have results or an in-progress index.
  if (!enabled || encrypted) return null
  const items = related ?? []
  const indexing = indexState !== 'idle'
  if (items.length === 0 && !indexing) return null

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  // Navigate to the matching section of the related note (mirrors GroupOverview.openSection).
  const openRelated = (rNoteId: string, rSectionId: string) => {
    useNotesStore.setState({ pendingInitialSectionId: rSectionId })
    setActiveNote(rNoteId)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('noteflow:request-section', { detail: { noteId: rNoteId, sectionId: rSectionId } }))
    }, 0)
  }

  return (
    <div
      className="flex-shrink-0 border-t border-text/10 text-[12px]"
      style={{ background: 'color-mix(in srgb, rgb(var(--bg-0)) 60%, rgb(var(--bg-1)) 40%)' }}
    >
      <button
        onClick={toggle}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-text/55 hover:text-text/80 transition-colors"
      >
        <Brain size={13} className="opacity-70" />
        <span className="font-medium tracking-wide uppercase text-[10.5px]">Related</span>
        {activeSectionName && (
          <span className="text-text/35 normal-case truncate max-w-[120px]">· {activeSectionName}</span>
        )}
        {indexing && (
          <span className="flex items-center gap-1 text-text/40 normal-case">
            <Loader2 size={11} className="animate-spin" />
            {indexState === 'downloading-model' ? 'downloading model…' : 'indexing…'}
          </span>
        )}
        {items.length > 0 && <span className="text-text/35">({items.length})</span>}
        <span className="ml-auto">{collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
      </button>

      {!collapsed && items.length > 0 && (
        <ul className="px-2 pb-2 flex flex-col gap-0.5 max-h-44 overflow-y-auto">
          {items.map((r) => {
            const sameNote = r.noteId === noteId
            return (
              <li key={`${r.noteId}:${r.sectionId}`}>
                <button
                  onClick={() => openRelated(r.noteId, r.sectionId)}
                  className="w-full text-left px-2 py-1 rounded hover:bg-text/5 transition-colors group"
                  title={r.snippet}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-text/80 group-hover:text-text">
                      {sameNote ? (r.sectionName || 'Section') : (r.title || 'Untitled')}
                    </span>
                    {sameNote ? (
                      <span className="flex-shrink-0 text-[9px] font-mono px-1 py-px rounded bg-text/8 text-text/40 italic">
                        this note
                      </span>
                    ) : r.sectionName ? (
                      <span className="flex-shrink-0 text-[9px] font-mono px-1 py-px rounded bg-text/8 text-text/50">
                        {r.sectionName}
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-[10px] text-text/35 font-mono mt-0.5">{r.snippet}</div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
