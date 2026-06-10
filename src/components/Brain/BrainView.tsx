import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Brain, ChevronDown, ChevronUp, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { useAiStore } from '../../stores/aiStore'
import { useNotesStore } from '../../stores/notesStore'
import { useBrainGraph } from './useBrainGraph'
import { BrainCanvas } from './BrainCanvas'

// Three.js (and the whole 3D scene) only enters its own chunk when the brain opens.
const BrainScene = lazy(() => import('./BrainScene'))

const RELATED_COLLAPSE_KEY = 'noteflow:brain-related-collapsed'

// Prefer the immersive 3D brain when WebGL is available and the user hasn't forced the 2D fallback
// (localStorage 'noteflow:brain-force-2d'). Detection runs once per mount.
function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function BrainView({ onClose }: { onClose: () => void }) {
  const enabled = useAiStore((s) => s.enabled)
  const indexState = useAiStore((s) => s.indexState)
  const progress = useAiStore((s) => s.progress)
  const fetchGraphEdges = useAiStore((s) => s.fetchGraphEdges)
  const setEnabled = useAiStore((s) => s.setEnabled)
  const reindexAll = useAiStore((s) => s.reindexAll)
  const fetchRelated = useAiStore((s) => s.fetchRelated)
  const relatedByKey = useAiStore((s) => s.relatedByKey)

  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const setGroupView = useNotesStore((s) => s.setGroupView)
  const notes = useNotesStore((s) => s.notes)
  const activeNoteId = useNotesStore((s) => s.activeNoteId)

  const model = useBrainGraph()
  const [enabling, setEnabling] = useState(false)
  const [enableError, setEnableError] = useState<string | null>(null)
  const [ctaDismissed, setCtaDismissed] = useState(false)
  const [relatedCollapsed, setRelatedCollapsed] = useState(
    () => localStorage.getItem(RELATED_COLLAPSE_KEY) === '1',
  )
  const [use3D] = useState(
    () => detectWebGL() && localStorage.getItem('noteflow:brain-force-2d') !== '1',
  )

  // ── Source selector: pick any (indexable) note + section right here, without leaving brain ──
  const selectableNotes = useMemo(
    () => notes.filter((n) => !n.archived && !n.encryption && !n.expiresAt),
    [notes],
  )
  const [sourceNoteId, setSourceNoteId] = useState<string | null>(null)
  const [sourceSectionId, setSourceSectionId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerFilter, setPickerFilter] = useState('')

  const sourceNote = selectableNotes.find((n) => n.id === sourceNoteId) ?? null
  const sourceSection = sourceNote?.sections.find((s) => s.id === sourceSectionId) ?? sourceNote?.sections[0] ?? null
  const relKey = sourceNote && sourceSection ? `${sourceNote.id}::${sourceSection.id}` : null
  // `undefined` = not fetched yet (still loading); an array (even empty) = resolved.
  const relatedResult = relKey ? relatedByKey[relKey] : undefined
  const relatedLoading = relKey != null && relatedResult === undefined
  const relatedItems = relatedResult ?? []

  const filteredNotes = useMemo(() => {
    const q = pickerFilter.trim().toLowerCase()
    if (!q) return selectableNotes
    return selectableNotes.filter((n) => (n.title || 'Untitled').toLowerCase().includes(q))
  }, [selectableNotes, pickerFilter])

  // Seed the source from the note that was open before entering brain (falls back to the first
  // note), and re-seed if the current source disappears.
  useEffect(() => {
    if (!enabled) return
    if (sourceNoteId && selectableNotes.some((n) => n.id === sourceNoteId)) return
    const seed =
      (activeNoteId ? selectableNotes.find((n) => n.id === activeNoteId) : undefined) ?? selectableNotes[0] ?? null
    setSourceNoteId(seed?.id ?? null)
    setSourceSectionId(seed?.sections[0]?.id ?? null)
  }, [enabled, selectableNotes, activeNoteId, sourceNoteId])

  useEffect(() => {
    if (enabled) void fetchGraphEdges()
  }, [enabled, fetchGraphEdges])

  useEffect(() => {
    if (!enabled || !sourceNote?.id || !sourceSection?.id) return
    fetchRelated(sourceNote.id, sourceSection.id)
  }, [enabled, sourceNote?.id, sourceSection?.id, fetchRelated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate to a clicked note's first section (mirrors GroupOverview.openSection): stash the
  // target so the editor — which mounts once the brain view closes — opens on the right section,
  // and re-assert it on the next macrotask for StrictMode's double mount.
  const openNote = (noteId: string, sectionId?: string) => {
    if (sectionId) useNotesStore.setState({ pendingInitialSectionId: sectionId })
    setOpenNoteIds([noteId])
    setActiveNote(noteId) // also closes the brain view
    if (sectionId) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('noteflow:request-section', { detail: { noteId, sectionId } }))
      }, 0)
    }
  }

  // Clicking a group node leaves the brain and opens that group's overview (setGroupView closes the brain).
  const openGroup = (groupId: string) => setGroupView(groupId)

  const enableAi = async () => {
    setEnabling(true)
    setEnableError(null)
    setCtaDismissed(true) // close the info popup so the progress pill (download %/indexing) is visible
    try {
      await setEnabled(true)
    } catch (err) {
      // Activation failed (model download/load crash, etc.) → surface the message and bring the
      // popup back so the user can read it and retry.
      setEnableError(String((err as Error)?.message ?? err))
      setCtaDismissed(false)
    } finally {
      setEnabling(false)
    }
  }

  const toggleRelatedCollapsed = () => {
    setRelatedCollapsed((c) => {
      const next = !c
      localStorage.setItem(RELATED_COLLAPSE_KEY, next ? '1' : '0')
      if (next) setPickerOpen(false)
      return next
    })
  }

  const pickNote = (id: string) => {
    const n = selectableNotes.find((s) => s.id === id)
    setSourceNoteId(id)
    setSourceSectionId(n?.sections[0]?.id ?? null)
    setPickerOpen(false)
    setPickerFilter('')
  }

  const indexing = indexState !== 'idle'
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null

  return (
    <div className="absolute inset-0 overflow-hidden flex flex-col" style={{ background: 'rgb(var(--bg-editor))' }}>

      {/* ── Canvas area ───────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        {use3D ? (
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-text-muted/60" />
              </div>
            }
          >
            <BrainScene model={model} showContentEdges={enabled} onOpenNote={openNote} onOpenGroup={openGroup} />
          </Suspense>
        ) : (
          <BrainCanvas model={model} showContentEdges={enabled} onOpenNote={openNote} onOpenGroup={openGroup} />
        )}

        {/* Header */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2.5 pointer-events-none">
          <div className="flex items-center gap-2 text-text/80 pointer-events-none">
            <Brain size={15} />
            <span className="text-xs font-mono tracking-wide">Brain</span>
            <span className="text-[11px] font-mono text-text-muted/60">
              {model.nodes.length} nodes
            </span>
          </div>
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* AI toggle — a switch: turning on opens the info popup first; turning off is instant
                and dismisses the activation popup so it doesn't reappear. */}
            <button
              onClick={
                enabling
                  ? undefined
                  : () => {
                      if (enabled) {
                        setEnabled(false)
                        setCtaDismissed(true)
                      } else {
                        setCtaDismissed(false)
                      }
                    }
              }
              disabled={enabling}
              role="switch"
              aria-checked={enabled}
              title={enabled ? 'Disable local AI' : 'Enable local AI'}
              className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded text-[11px] font-mono border transition-colors disabled:opacity-60 ${
                enabled || enabling
                  ? 'border-text/30 text-text bg-surface-2'
                  : 'border-border text-text-muted hover:text-text'
              }`}
            >
              {enabling ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              <span>Local AI</span>
              {/* switch pill — visual on/off state */}
              <span
                className={`relative flex-shrink-0 w-7 h-4 rounded-full transition-colors ${
                  enabled ? 'bg-text/70' : 'bg-surface-3 border border-border'
                }`}
              >
                <span
                  className={`absolute top-[2px] w-3 h-3 bg-white rounded-full shadow transition-all duration-200 ${
                    enabled ? 'left-[14px]' : 'left-[2px]'
                  }`}
                />
              </span>
            </button>
            {/* Reindex */}
            {enabled && (
              <button
                onClick={() => reindexAll()}
                disabled={indexing}
                title={indexing ? 'Indexing in progress…' : 'Reindex all notes'}
                className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={12} className={indexing ? 'animate-spin' : ''} />
              </button>
            )}
            <button
              onClick={onClose}
              title="Close brain view"
              className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Empty state */}
        {model.nodes.length === 0 && !indexing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs font-mono text-text-muted/70">No notes to display yet.</p>
          </div>
        )}

        {/* Download / indexing progress pill — shown during activation too (before `enabled` flips,
            since ai:set-settings only resolves once the model download + first reindex finish), so
            the long first run always has visible feedback instead of looking frozen. */}
        {(enabling || indexing) && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-1 border border-border shadow-lg">
            <Loader2 size={12} className="animate-spin text-text" />
            <span className="text-[11px] font-mono text-text-muted">
              {indexState === 'downloading-model'
                ? `Downloading model${pct != null ? ` ${pct}%` : '…'}`
                : indexState === 'indexing'
                  ? `Indexing${pct != null ? ` ${pct}%` : '…'}`
                  : 'Starting…'}
            </span>
          </div>
        )}

        {/* Activation CTA */}
        {!enabled && !ctaDismissed && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
            <div className="w-[380px] max-w-[85%] rounded-lg border border-border bg-surface-1 p-5 shadow-2xl">
              <div className="flex items-center gap-2 mb-2 text-text">
                <Sparkles size={16} />
                <h2 className="text-sm font-mono font-bold tracking-wide">Enable local AI</h2>
              </div>
              <p className="text-[12px] leading-relaxed text-text-muted font-mono mb-4">
                Brain already shows your notes and groups structure. Enable local AI
                (100% offline) to also reveal{' '}
                <span className="text-text">content connections</span>: notes that share
                topics even across different groups. On first use, a small model is downloaded
                and your notes are indexed — the app may use more CPU for a while.
              </p>
              {enableError && (
                <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2">
                  <p className="text-[10px] font-mono font-bold text-red-400 mb-1">Activation failed</p>
                  <pre className="text-[10px] font-mono text-red-300/90 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                    {enableError}
                  </pre>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setCtaDismissed(true)}
                  className="flex-1 flex items-center justify-center px-3 py-2 rounded border border-border text-text-muted text-xs font-mono hover:text-text hover:border-text/30 transition-colors"
                >
                  Don't enable
                </button>
                <button
                  onClick={enableAi}
                  disabled={enabling}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded bg-text text-surface-0 text-xs font-mono font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {enabling ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {enabling ? 'Enabling…' : 'Enable local AI'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Related notes panel (bottom, collapsible with fold animation) ── */}
      {enabled && (
        <div
          className="relative flex-shrink-0 border-t border-text/10 text-[12px]"
          style={{ background: 'color-mix(in srgb, rgb(var(--bg-0)) 60%, rgb(var(--bg-1)) 40%)' }}
        >
          {/* Note picker popover — rendered at panel level so it escapes the clipped body */}
          {!relatedCollapsed && pickerOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
              <div className="absolute bottom-full left-3 mb-1 w-60 rounded-lg border border-border bg-surface-1 shadow-2xl overflow-hidden z-30">
                <div className="p-1.5 border-b border-border">
                  <input
                    autoFocus
                    value={pickerFilter}
                    onChange={(e) => setPickerFilter(e.target.value)}
                    placeholder="Search notes…"
                    className="w-full bg-surface-0 border border-border rounded px-2 py-1 text-[11px] font-mono text-text placeholder-text-muted/40 outline-none focus:border-text/30"
                  />
                </div>
                <ul className="max-h-56 overflow-y-auto py-1">
                  {filteredNotes.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => pickNote(n.id)}
                        className={`w-full text-left px-2.5 py-1 text-[11px] truncate hover:bg-text/5 transition-colors ${
                          n.id === sourceNoteId ? 'text-text' : 'text-text/70'
                        }`}
                      >
                        {n.title || 'Untitled'}
                      </button>
                    </li>
                  ))}
                  {filteredNotes.length === 0 && (
                    <li className="px-2.5 py-2 text-[11px] font-mono text-text-muted/60">No notes</li>
                  )}
                </ul>
              </div>
            </>
          )}

          <button
            onClick={toggleRelatedCollapsed}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-text/55 hover:text-text/80 transition-colors"
          >
            <Brain size={13} className="opacity-70" />
            <span className="font-medium tracking-wide uppercase text-[10.5px]">Related</span>
            {(indexing || relatedLoading) && <Loader2 size={11} className="animate-spin text-text/40" />}
            {relatedItems.length > 0 && <span className="text-text/35">({relatedItems.length})</span>}
            <span className="ml-auto">
              {relatedCollapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          </button>

          {/* Animated fold: grid-rows 0fr→1fr animates to the natural content height */}
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-in-out"
            style={{ gridTemplateRows: relatedCollapsed ? '0fr' : '1fr' }}
          >
            <div className="overflow-hidden min-h-0">
              <div className="px-3 pb-2.5 pt-0.5">
                {/* Source selector: which note/section to find connections for */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-text/30 flex-shrink-0">From</span>
                  <button
                    onClick={() => setPickerOpen((o) => !o)}
                    className="flex items-center gap-1 min-w-0 px-2 py-1 rounded border border-border bg-surface-1/60 hover:border-text/25 transition-colors"
                  >
                    <span className="truncate text-[11px] text-text/80 max-w-[180px]">
                      {sourceNote?.title || 'Select a note'}
                    </span>
                    <ChevronDown size={11} className="text-text/40 flex-shrink-0" />
                  </button>
                </div>

                {/* Section chips for the chosen note */}
                {sourceNote && sourceNote.sections.length > 0 && (
                  <div className="flex items-center gap-1 mb-2 flex-wrap">
                    {sourceNote.sections.map((sec) => (
                      <button
                        key={sec.id}
                        onClick={() => setSourceSectionId(sec.id)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                          sec.id === sourceSection?.id
                            ? 'border-text/30 text-text bg-surface-2'
                            : 'border-border text-text-muted hover:text-text'
                        }`}
                      >
                        {sec.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Results — section name (primary) + note title (chip) */}
                {relatedItems.length > 0 ? (
                  <ul className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                    {relatedItems.map((r) => {
                      const sameNote = r.noteId === sourceNote?.id
                      return (
                        <li key={`${r.noteId}:${r.sectionId}`}>
                          <button
                            onClick={() => openNote(r.noteId, r.sectionId)}
                            className="w-full text-left px-2 py-1 rounded hover:bg-text/5 transition-colors group flex items-center gap-2"
                            title={`${r.sectionName} · ${r.title || 'Untitled'}`}
                          >
                            <span className="truncate text-text/80 group-hover:text-text flex-1 min-w-0">
                              {r.sectionName || 'Untitled section'}
                            </span>
                            <span className="flex-shrink-0 text-[9px] font-mono px-1 py-px rounded bg-text/8 text-text/50 max-w-[120px] truncate">
                              {sameNote ? '↻ this note' : (r.title || 'Untitled')}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : relatedLoading || indexing ? (
                  <p className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-mono text-text-muted/60">
                    <Loader2 size={11} className="animate-spin" />
                    {indexing ? 'Indexing…' : 'Finding related notes…'}
                  </p>
                ) : (
                  <p className="px-2 py-1.5 text-[11px] font-mono text-text-muted/60">
                    No related notes found.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
