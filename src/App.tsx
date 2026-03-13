import { useEffect, useRef, useState, useCallback } from 'react'
import { useNotesStore } from './stores/notesStore'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { NoteEditor } from './components/Editor/NoteEditor'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { PanelLeftOpen } from 'lucide-react'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 480
const SIDEBAR_DEFAULT = 256

export function App() {
  const { loadNotes, isLoading, createNote, setCommandPaletteOpen } = useNotesStore()

  const [sidebarWidth, setSidebarWidth]     = useState(SIDEBAR_DEFAULT)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartW = useRef(SIDEBAR_DEFAULT)

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => { loadNotes() }, [loadNotes])

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault(); setCommandPaletteOpen(true); return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !isEditing) {
        e.preventDefault(); createNote(); return
      }
      // Ctrl+B — toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === 'b' && !isEditing) {
        e.preventDefault(); setSidebarVisible((v) => !v); return
      }
      if ((e.ctrlKey || e.metaKey) && !isEditing) {
        const map: Record<string, () => void> = {
          '1': () => createNote(),
          '2': () => createNote(),
          '3': () => createNote(),
        }
        if (map[e.key]) { e.preventDefault(); map[e.key]() }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createNote, setCommandPaletteOpen])

  // ── Global shortcuts (via IPC) ─────────────────────────────────────────────
  useEffect(() => {
    if (!window.noteflow?.onNewNote) return
    return window.noteflow.onNewNote(() => createNote())
  }, [createNote])

  // ── Resize drag handlers ──────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartW.current = sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [sidebarWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = e.clientX - dragStartX.current
      const next  = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartW.current + delta))
      setSidebarWidth(next)
    }
    const onUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div className="flex flex-col h-screen bg-surface-0 text-text overflow-hidden">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Sidebar ───────────────────────────────────────────────── */}
        {sidebarVisible && (
          <>
            <div style={{ width: sidebarWidth, minWidth: sidebarWidth }} className="flex-shrink-0 overflow-hidden">
              <Sidebar onCollapse={() => setSidebarVisible(false)} />
            </div>

            {/* Drag handle */}
            <div
              onMouseDown={handleDragStart}
              className="w-1 flex-shrink-0 cursor-col-resize hover:bg-accent/40 active:bg-accent/60
                         transition-colors group relative z-10"
              title="Drag to resize"
            />
          </>
        )}

        {/* ── Collapse / expand toggle ──────────────────────────────── */}
        {!sidebarVisible && (
          <button
            onClick={() => setSidebarVisible(true)}
            title="Show sidebar (Ctrl+B)"
            className="flex-shrink-0 flex items-center justify-center w-7 h-full
                       text-text-muted/40 hover:text-text-muted hover:bg-surface-2
                       border-r border-border transition-colors"
          >
            <PanelLeftOpen size={14} />
          </button>
        )}

        {/* ── Main editor ──────────────────────────────────────────── */}
        <main className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-xs font-mono text-text-muted animate-pulse">Loading notes...</div>
            </div>
          ) : (
            <NoteEditor />
          )}
        </main>
      </div>

      <CommandPalette />
    </div>
  )
}

export default App
