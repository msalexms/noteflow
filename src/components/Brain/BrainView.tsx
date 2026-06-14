import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Brain, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { useAiStore } from '../../stores/aiStore'
import { useAiChatStore } from '../../stores/aiChatStore'
import { useNotesStore } from '../../stores/notesStore'
import { useBrainGraph } from './useBrainGraph'
import { BrainCanvas } from './BrainCanvas'
import { AiPanel } from '../AiPanel/AiPanel'
import { BrainNodePreview, type PinnedPreview } from './BrainNodePreview'

// Three.js (and the whole 3D scene) only enters its own chunk when the brain opens.
const BrainScene = lazy(() => import('./BrainScene'))

const SPLIT_KEY = 'noteflow:brain-split-width' // left (AI panel) width as a %

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

  const activeSources = useAiChatStore((s) => s.activeSources)
  const streaming = useAiChatStore((s) => s.streaming)
  const highlightedNoteIds = useMemo(() => new Set(activeSources.map((s) => s.noteId)), [activeSources])

  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const setGroupView = useNotesStore((s) => s.setGroupView)

  // Clicking a note/section node pins a preview card next to it; clicking the card
  // navigates to that section. (Canvas nodes are drawn, not DOM, so the handlers
  // report the click position back to us.)
  const [pinned, setPinned] = useState<PinnedPreview | null>(null)
  const onNodeActivate = useCallback(
    (noteId: string, sectionId: string | undefined, x: number, y: number) =>
      setPinned({ noteId, sectionId, x, y }),
    [],
  )

  const model = useBrainGraph()
  const [enabling, setEnabling] = useState(false)
  const [enableError, setEnableError] = useState<string | null>(null)
  const [ctaDismissed, setCtaDismissed] = useState(false)
  const [use3D] = useState(() => detectWebGL() && localStorage.getItem('noteflow:brain-force-2d') !== '1')

  // ── Resizable split (AI panel | brain) ──
  const containerRef = useRef<HTMLDivElement>(null)
  const [splitPct, setSplitPct] = useState(() => {
    const saved = Number(localStorage.getItem(SPLIT_KEY))
    return saved >= 25 && saved <= 75 ? saved : 42
  })
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const pct = Math.max(25, Math.min(75, ((e.clientX - rect.left) / rect.width) * 100))
      setSplitPct(pct)
    }
    const onUp = () => { setDragging(false); localStorage.setItem(SPLIT_KEY, String(Math.round(splitPct))) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging, splitPct])

  useEffect(() => {
    if (enabled) void fetchGraphEdges()
  }, [enabled, fetchGraphEdges])

  // Navigate to a clicked note's section (mirrors the old behaviour): stash the target so the editor
  // — which mounts once the brain view closes — opens on the right section, and re-assert it on the
  // next macrotask for StrictMode's double mount.
  const openNote = useCallback((noteId: string, sectionId?: string) => {
    if (sectionId) useNotesStore.setState({ pendingInitialSectionId: sectionId })
    setOpenNoteIds([noteId])
    setActiveNote(noteId) // also closes the brain view
    if (sectionId) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('noteflow:request-section', { detail: { noteId, sectionId } }))
      }, 0)
    }
  }, [setOpenNoteIds, setActiveNote])

  const openGroup = useCallback((groupId: string) => setGroupView(groupId), [setGroupView])

  const enableAi = async () => {
    setEnabling(true)
    setEnableError(null)
    setCtaDismissed(true)
    try {
      await setEnabled(true)
    } catch (err) {
      setEnableError(String((err as Error)?.message ?? err))
      setCtaDismissed(false)
    } finally {
      setEnabling(false)
    }
  }

  const indexing = indexState !== 'idle'
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden flex" style={{ background: 'rgb(var(--bg-editor))' }}>
      {/* ── Left: AI panel ─────────────────────────────────────────── */}
      <div style={{ width: `${splitPct}%` }} className="flex-shrink-0 min-w-0 h-full">
        <AiPanel onOpenNote={openNote} />
      </div>

      {/* Divider */}
      <div
        onMouseDown={() => setDragging(true)}
        className="w-1 flex-shrink-0 cursor-col-resize hover:bg-text/30 active:bg-text/50 transition-colors z-10"
        title="Drag to resize"
      />

      {/* ── Right: brain canvas ────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0 min-w-0 overflow-hidden">
        {use3D ? (
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-text-muted/60" />
              </div>
            }
          >
            <BrainScene model={model} showContentEdges={enabled} onOpenNote={openNote} onOpenGroup={openGroup} highlightedNoteIds={highlightedNoteIds} thinking={streaming} onNodeActivate={onNodeActivate} />
          </Suspense>
        ) : (
          <BrainCanvas model={model} showContentEdges={enabled} onOpenNote={openNote} onOpenGroup={openGroup} highlightedNoteIds={highlightedNoteIds} onNodeActivate={onNodeActivate} />
        )}

        {pinned && (
          <BrainNodePreview
            pinned={pinned}
            onOpen={(noteId, sectionId) => { setPinned(null); openNote(noteId, sectionId) }}
            onDismiss={() => setPinned(null)}
          />
        )}

        {/* Header */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2.5 pointer-events-none">
          <div className="flex items-center gap-2 text-text/80">
            <Brain size={15} />
            <span className="text-xs font-mono tracking-wide">Brain</span>
            <span className="text-[11px] font-mono text-text-muted/60">{model.nodes.length} nodes</span>
          </div>
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={enabling ? undefined : () => { if (enabled) { setEnabled(false); setCtaDismissed(true) } else setCtaDismissed(false) }}
              disabled={enabling}
              role="switch"
              aria-checked={enabled}
              title={enabled ? 'Disable local AI' : 'Enable local AI'}
              className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded text-[11px] font-mono border transition-colors disabled:opacity-60 ${
                enabled || enabling ? 'border-text/30 text-text bg-surface-2' : 'border-border text-text-muted hover:text-text'
              }`}
            >
              {enabling ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              <span>Local AI</span>
              <span className={`relative flex-shrink-0 w-7 h-4 rounded-full transition-colors ${enabled ? 'bg-text/70' : 'bg-surface-3 border border-border'}`}>
                <span className={`absolute top-[2px] w-3 h-3 bg-white rounded-full shadow transition-all duration-200 ${enabled ? 'left-[14px]' : 'left-[2px]'}`} />
              </span>
            </button>
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

        {/* Download / indexing progress pill */}
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
                Brain already shows your notes and groups structure. Enable local AI (100% offline) to also reveal{' '}
                <span className="text-text">content connections</span> and give the chat context from your notes. On first
                use, a small model is downloaded and your notes are indexed — the app may use more CPU for a while.
              </p>
              {enableError && (
                <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2">
                  <p className="text-[10px] font-mono font-bold text-red-400 mb-1">Activation failed</p>
                  <pre className="text-[10px] font-mono text-red-300/90 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">{enableError}</pre>
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
    </div>
  )
}
