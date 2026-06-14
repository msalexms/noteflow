import { useEffect } from 'react'
import { nanoid } from 'nanoid'
import { X, Star, FileText, Lock, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { useNotesStore } from '../../stores/notesStore'
import { useSectionTagColorsStore, type SectionTagColorMap } from '../../stores/sectionTagColorsStore'
import { SectionPreviewCard, CARD_WIDTH } from '../SectionPreview/SectionPreviewCard'
import type { Note, NoteSection } from '../../types'

interface NoteOverviewProps {
  noteId: string
  onClose: () => void
}

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

// ── Section card — a clickable wrapper around the shared preview mock ───────────
interface SectionCardProps {
  note: Note
  section: NoteSection
  sectionTagColors: SectionTagColorMap
  onOpen: (sectionId: string) => void
}

function SectionCard({ note, section, sectionTagColors, onOpen }: SectionCardProps) {
  return (
    <button
      onClick={() => onOpen(section.id)}
      title={`Open "${section.name}"`}
      className="group relative text-left rounded-lg border border-solid border-text/20 bg-surface-1 shadow-md
                 hover:border-text/45 hover:shadow-lg hover:-translate-y-0.5
                 transition-all duration-150 overflow-hidden flex flex-col"
      style={{ width: CARD_WIDTH }}
    >
      <SectionPreviewCard note={note} section={section} sectionTagColors={sectionTagColors} />
    </button>
  )
}
