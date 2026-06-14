import { useEffect, useMemo } from 'react'
import { nanoid } from 'nanoid'
import { X, Star, FileText, Lock, Eye, Edit3, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { useNotesStore } from '../../stores/notesStore'
import { useSectionTagColorsStore, type SectionTagColorMap } from '../../stores/sectionTagColorsStore'
import { htmlFromMarkdown } from '../../lib/markdownHtml'
import { getTagColor } from '../../lib/tagColors'
import type { Note, NoteSection } from '../../types'

interface NoteOverviewProps {
  noteId: string
  onClose: () => void
}

// Fixed card width (px) — a section card is a small mock of the open editor.
const CARD_WIDTH = 240
// Height of the clamped content area (≈ a handful of lines once zoomed).
const PREVIEW_HEIGHT = 120
// `zoom` shrinks the rendered body (Chromium-only, fine in Electron) so the few
// visible lines read like the open note, just tiny.
const PREVIEW_ZOOM = 0.5

export function NoteOverview({ noteId, onClose }: NoteOverviewProps) {
  const note = useNotesStore((s) => s.notes.find((n) => n.id === noteId) ?? null)
  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const updateNote = useNotesStore((s) => s.updateNote)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)

  // Note vanished (deleted locally or via sync) → close the overview
  useEffect(() => {
    if (!note) onClose()
  }, [note, onClose])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const locked = Boolean(note?.encryption && note.sections.length === 0)

  // Navigate straight to a clicked section. Stash it in pendingInitialSectionId so the editor
  // (which mounts fresh once the overview closes) opens on the right section with no flash, and
  // re-assert it via the request-section event once the editor is listening — same dance the
  // group overview and brain view use.
  const openSection = (sectionId: string) => {
    useNotesStore.setState({ pendingInitialSectionId: sectionId })
    setOpenNoteIds([noteId])
    setActiveNote(noteId)
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('noteflow:request-section', { detail: { noteId, sectionId } }),
      )
    }, 0)
  }

  // Add a fresh section and jump straight into the editor on it, so the user
  // writes there rather than landing back on an empty card in the overview.
  const addSection = async () => {
    if (!note || locked) return
    const newSection: NoteSection = { id: nanoid(6), name: 'New', content: '' }
    await updateNote(note.id, { sections: [...note.sections, newSection] })
    openSection(newSection.id)
  }

  if (!note) return null

  const sectionCount = note.sections.length

  return (
    <div
      className="h-full w-full overflow-y-auto"
      style={{ background: 'rgb(var(--bg-editor))' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-6 py-4 border-b border-border backdrop-blur"
        style={{ background: 'rgb(var(--bg-1) / 0.85)' }}
      >
        {note.encryption && <Lock size={13} className="text-amber-400 flex-shrink-0" />}
        <h1 className="text-sm font-mono font-semibold text-text truncate">
          {note.title || 'Untitled'}
        </h1>
        <button
          onClick={() => updateNote(note.id, { favorited: !note.favorited })}
          title={note.favorited ? 'Remove from favorites' : 'Add to favorites'}
          className={`p-1 rounded flex-shrink-0 transition-colors
            ${note.favorited ? 'text-yellow-400 bg-yellow-400/10' : 'text-text-muted hover:text-text hover:bg-surface-3'}`}
        >
          <Star size={13} fill={note.favorited ? 'currentColor' : 'none'} />
        </button>
        <span className="text-[11px] font-mono text-text-muted/60 flex-shrink-0">
          {sectionCount} {sectionCount === 1 ? 'section' : 'sections'}
          {' · '}
          {format(new Date(note.updated), 'dd/MM/yyyy · HH:mm')}
        </span>

        <div className="flex-1" />

        {!locked && (
          <button
            onClick={() => void addSection()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-surface-2 text-[11px] font-mono text-text-muted hover:text-text hover:border-text/25 transition-colors"
            title="Add section and edit it"
          >
            <Plus size={12} /> Add section
          </button>
        )}
        <button
          onClick={onClose}
          className="ml-1 flex items-center justify-center w-7 h-7 rounded border border-border bg-surface-2 text-text-muted hover:text-text hover:border-text/25 transition-colors"
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-6 py-5">
        {locked ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <Lock size={28} className="text-text-muted/40" />
            <p className="text-sm font-mono text-text-muted">This note is encrypted</p>
            <p className="text-xs font-mono text-text-muted/60">Unlock it in the editor to preview its sections</p>
          </div>
        ) : sectionCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <FileText size={28} className="text-text-muted/40" />
            <p className="text-sm font-mono text-text-muted">This note has no sections</p>
          </div>
        ) : (
          <div
            className="grid gap-4 justify-start"
            style={{ gridTemplateColumns: `repeat(auto-fill, ${CARD_WIDTH}px)` }}
          >
            {note.sections.map((section) => (
              <SectionCard
                key={section.id}
                note={note}
                section={section}
                sectionTagColors={sectionTagColors}
                onOpen={openSection}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section card — a small mock of the editor when that section is open ─────────
interface SectionCardProps {
  note: Note
  section: NoteSection
  sectionTagColors: SectionTagColorMap
  onOpen: (sectionId: string) => void
}

function SectionCard({ note, section, sectionTagColors, onOpen }: SectionCardProps) {
  const colorStyle = getTagColor(section.name, sectionTagColors)
  const hasContent = section.content.trim().length > 0
  // Render the section body to the same HTML the editor produces, so the preview
  // matches the open note exactly. Memoised — markdown→HTML isn't free per card.
  const html = useMemo(
    () => (hasContent ? htmlFromMarkdown(section.content) : ''),
    [section.content, hasContent],
  )

  return (
    <button
      onClick={() => onOpen(section.id)}
      title={`Open "${section.name}"`}
      className="group relative text-left rounded-lg border border-solid border-text/20 bg-surface-1 shadow-md
                 hover:border-text/45 hover:shadow-lg hover:-translate-y-0.5
                 transition-all duration-150 overflow-hidden flex flex-col"
      style={{ width: CARD_WIDTH }}
    >
      {/* Section label (the card's identity — which tab this represents) */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/60 bg-surface-2/50 group-hover:bg-surface-2/80 transition-colors">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colorStyle.color }} />
        <span className="text-[11px] font-mono font-medium truncate" style={{ color: colorStyle.color }}>
          {section.name}
        </span>
        <span
          className="ml-auto flex items-center text-text-muted/50 flex-shrink-0"
          title={section.isRawMode ? 'Raw markdown section' : 'Rich text section'}
        >
          {section.isRawMode ? <Edit3 size={10} /> : <Eye size={10} />}
        </span>
      </div>

      {/* Editor mock — title + date, a representational toolbar, then a few lines */}
      <div className="flex flex-col" style={{ background: 'rgb(var(--bg-editor))' }}>
        <div className="px-3 pt-2.5">
          <div className="text-[12.5px] font-mono font-bold text-text truncate">
            {note.title || 'Untitled'}
          </div>
          <div className="text-[8.5px] font-mono text-text-muted/50 mt-0.5">
            {format(new Date(note.created), 'MMM d, yyyy · HH:mm')}
          </div>
        </div>

        {/* Toolbar — purely representational: a dark bar with a few faint marks */}
        <div className="px-3 mt-2">
          <div
            className="h-3.5 rounded-sm flex items-center gap-1 px-1.5"
            style={{ background: 'rgb(var(--bg-0) / 0.65)' }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className="w-2 h-1.5 rounded-[1px] bg-text/10" />
            ))}
          </div>
        </div>

        {/* A few lines of the section, as if the note were open — just tiny */}
        <div
          className="note-preview relative overflow-hidden px-3 pt-1.5"
          style={{ height: PREVIEW_HEIGHT }}
        >
          {hasContent ? (
            <div
              className="prose-editor pointer-events-none select-none"
              style={{ zoom: PREVIEW_ZOOM }}
            >
              <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 pt-1 text-text-muted/35">
              <Plus size={11} />
              <span className="text-[10px] font-mono">Empty section</span>
            </div>
          )}

          {/* Bottom fade — suggests there's more below the fold */}
          {hasContent && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
              style={{ background: 'linear-gradient(to top, rgb(var(--bg-editor)), transparent)' }}
            />
          )}
        </div>
      </div>
    </button>
  )
}
