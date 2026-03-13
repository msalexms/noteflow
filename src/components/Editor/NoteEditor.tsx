import { useEffect, useRef, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { Editor } from './Editor'
import type { NoteSection } from '../../types'
import { nanoid } from 'nanoid'
import {
  Pin, Archive, Trash2, Copy, Eye, Edit3,
  Plus, X, Check, Pencil,
} from 'lucide-react'
import { format } from 'date-fns'
import { ConfirmModal } from '../ConfirmModal'

// ---------------------------------------------------------------------------
// Confirm modal state type
// ---------------------------------------------------------------------------
interface ModalState {
  title: string
  message: string
  confirmLabel: string
  danger: boolean
  onConfirm: () => void
}

// ---------------------------------------------------------------------------
// NoteEditor
// ---------------------------------------------------------------------------
export function NoteEditor() {
  const note        = useNotesStore((s) => s.notes.find((n) => n.id === s.activeNoteId) ?? null)
  const updateNote  = useNotesStore((s) => s.updateNote)
  const deleteNote  = useNotesStore((s) => s.deleteNote)
  const archiveNote = useNotesStore((s) => s.archiveNote)

  // Active section by id (not index — stable across reorders)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)

  // Raw (markdown source) mode buffer
  const [rawContent, setRawContent] = useState('')

  // Tab rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  // Confirm modal
  const [modal, setModal] = useState<ModalState | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)

  // ── Sync raw buffer when switching sections ────────────────────────────────
  const activeSection: NoteSection | undefined = note?.sections.find(
    (s) => s.id === activeSectionId,
  ) ?? note?.sections[0]

  const rawMode = activeSection?.isRawMode ?? false

  // ── Reset when the active note changes ─────────────────────────────────────
  useEffect(() => {
    if (!note) return
    const firstId = note.sections[0]?.id ?? null
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveSectionId(firstId)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRawContent(note.sections[0]?.content ?? '')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRenamingId(null)
  }, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref to note so handlers always see the latest value
  const noteRef = useRef(note)
  useEffect(() => { noteRef.current = note })

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  const openDeleteNoteModal = () => {
    setModal({
      title: 'Delete note',
      message: `"${note!.title || 'Untitled'}" will be permanently deleted.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => { setModal(null); deleteNote(note!.id) },
    })
  }

  // ── Delete key on the note (only when editor is NOT focused) ──────────────
  useEffect(() => {
    if (!note) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      if (e.key === 'Delete' && !isEditing) {
        e.preventDefault()
        openDeleteNoteModal()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [note]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Early exit ─────────────────────────────────────────────────────────────
  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted gap-3">
        <div className="text-4xl opacity-20 font-mono">_</div>
        <p className="text-sm font-mono">No note selected</p>
        <p className="text-xs opacity-50 font-mono">Ctrl+N to create one</p>
      </div>
    )
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    updateNote(note.id, { title: e.target.value })

  const handleSectionContentChange = (content: string) => {
    if (!activeSection) return
    if (activeSection.content === content) return
    updateNote(note.id, {
      sections: note.sections.map((s) =>
        s.id === activeSection.id ? { ...s, content } : s,
      ),
    })
  }

  const handleCopyMarkdown = () => navigator.clipboard.writeText(note.raw)

  const handleRawToggle = () => {
    if (!activeSection) return
    const newRawMode = !rawMode

    if (newRawMode) {
      setRawContent(activeSection.content)
      updateNote(note.id, {
        sections: note.sections.map((s) =>
          s.id === activeSection.id ? { ...s, isRawMode: true } : s,
        ),
      })
    } else {
      updateNote(note.id, {
        sections: note.sections.map((s) =>
          s.id === activeSection.id ? { ...s, content: rawContent, isRawMode: false } : s,
        ),
      })
    }
  }

  // Switch to a section
  const handleSwitchSection = (sectionId: string) => {
    if (sectionId === activeSectionId) return

    // Commit any in-progress raw edit before switching
    if (rawMode && activeSection) {
      updateNote(note!.id, {
        sections: noteRef.current!.sections.map((s) =>
          s.id === activeSection.id ? { ...s, content: rawContent } : s,
        ),
      })
    }
    
    setRawContent(noteRef.current?.sections.find((s) => s.id === sectionId)?.content ?? '')
    setActiveSectionId(sectionId)
  }

  // ── Section tab management ────────────────────────────────────────────────

  const handleAddSection = () => {
    const newSection: NoteSection = { id: nanoid(6), name: 'New', content: '', isRawMode: false }
    const sections = [...note.sections, newSection]
    updateNote(note.id, { sections })
    setRawContent('')
    setActiveSectionId(newSection.id)
    // Immediately start renaming the new tab
    setRenamingId(newSection.id)
    setRenameValue('New')
  }

  const handleDeleteSection = (sectionId: string) => {
    if (note.sections.length <= 1) return // keep at least one
    setModal({
      title: 'Delete section',
      message: `Delete the "${note.sections.find((s) => s.id === sectionId)?.name}" section? Its content will be lost.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        setModal(null)
        const sections = note.sections.filter((s) => s.id !== sectionId)
        updateNote(note.id, { sections })
        if (activeSectionId === sectionId) {
          setActiveSectionId(sections[0]?.id ?? null)
        }
      },
    })
  }

  const handleStartRename = (section: NoteSection) => {
    setRenamingId(section.id)
    setRenameValue(section.name)
  }

  const handleCommitRename = () => {
    if (!renamingId) return
    const trimmed = renameValue.trim()
    if (trimmed) {
      updateNote(note.id, {
        sections: note.sections.map((s) =>
          s.id === renamingId ? { ...s, name: trimmed } : s,
        ),
      })
    }
    setRenamingId(null)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCommitRename() }
    if (e.key === 'Escape') { setRenamingId(null) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {modal && (
        <ConfirmModal
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          danger={modal.danger}
          onConfirm={modal.onConfirm}
          onCancel={() => setModal(null)}
        />
      )}

      <div className="flex flex-col h-full" onKeyDown={(e) => e.stopPropagation()}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-border min-h-0 flex-shrink-0">

          {/* Section tabs */}
          <div className="flex items-center gap-1.5 flex-1 overflow-x-auto min-w-0 pr-1">
            {note.sections.map((section) => {
              const isActive = section.id === (activeSection?.id)
              const isRenaming = renamingId === section.id
              return (
                 <div
                   key={section.id}
                   className={`group flex items-center gap-1 flex-shrink-0 rounded px-0.5
                     ${isActive
                       ? 'bg-yellow-400/10 border border-yellow-400/25'
                       : 'border border-border/40 hover:border-border/70'
                     }`}
                 >
                  {isRenaming ? (
                    // Inline rename input
                    <div className="flex items-center gap-0.5 px-1.5 py-1">
                      <input
                        ref={renameRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={handleRenameKeyDown}
                        onBlur={handleCommitRename}
                        className="w-20 bg-surface-0 border border-yellow-400/40 rounded px-1
                                   text-xs font-mono text-text outline-none caret-yellow-400"
                      />
                      <button
                        onMouseDown={(e) => { e.preventDefault(); handleCommitRename() }}
                        className="text-yellow-400 hover:text-yellow-400 p-0.5 rounded"
                      >
                        <Check size={10} />
                      </button>
                    </div>
                  ) : (
                    // Normal tab
                    <button
                      onClick={() => handleSwitchSection(section.id)}
                      onDoubleClick={() => handleStartRename(section)}
                      className={`px-2 py-0.5 text-xs font-mono transition-colors
                        ${isActive ? 'text-yellow-400' : 'text-text-muted'}`}
                    >
                      {section.name}
                    </button>
                  )}

                  {/* Tab actions: always occupy space; hidden on inactive, shown on hover or active */}
                  {!isRenaming && (
                    <div className={`flex items-center gap-0.5 pr-1
                      ${isActive ? 'visible' : 'invisible group-hover:visible'}`}
                    >
                      <button
                        onClick={() => handleStartRename(section)}
                        title="Rename section"
                        className="p-0.5 rounded text-text-muted/50 hover:text-text-muted transition-colors"
                      >
                        <Pencil size={9} />
                      </button>
                      {note.sections.length > 1 && (
                        <button
                          onClick={() => handleDeleteSection(section.id)}
                          title="Delete section"
                          className="p-0.5 rounded text-text-muted/50 hover:text-red-400 transition-colors"
                        >
                          <X size={9} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add section button */}
            <button
              onClick={handleAddSection}
              title="Add section"
              className="flex items-center justify-center w-6 h-6 rounded flex-shrink-0
                         text-text-muted/40 hover:text-text-muted hover:bg-surface-2
                         border border-transparent hover:border-border transition-colors"
            >
              <Plus size={11} />
            </button>
          </div>

          {/* Note action buttons */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={handleRawToggle}
              title={rawMode ? 'Editor mode' : 'Raw markdown'}
              className={`p-1.5 rounded text-xs transition-colors
                ${rawMode
                  ? 'text-accent bg-accent/10 border border-accent/20'
                  : 'text-text-muted hover:text-text hover:bg-surface-2 border border-transparent'
                }`}
            >
              {rawMode ? <Edit3 size={13} /> : <Eye size={13} />}
            </button>
            <button
              onClick={handleCopyMarkdown}
              title="Copy as Markdown"
              className="p-1.5 rounded text-xs text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            >
              <Copy size={13} />
            </button>
            <button
              onClick={() => updateNote(note.id, { pinned: !note.pinned })}
              title={note.pinned ? 'Unpin' : 'Pin'}
              className={`p-1.5 rounded text-xs transition-colors
                ${note.pinned ? 'text-yellow-400 bg-yellow-400/10' : 'text-text-muted hover:text-text hover:bg-surface-2'}`}
            >
              <Pin size={13} />
            </button>
            <button
              onClick={() => archiveNote(note.id)}
              title={note.archived ? 'Unarchive' : 'Archive'}
              className="p-1.5 rounded text-xs text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            >
              <Archive size={13} />
            </button>
            <button
              onClick={openDeleteNoteModal}
              title="Delete note (Del)"
              className="p-1.5 rounded text-xs text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* ── Title ───────────────────────────────────────────────────── */}
        <div className="px-4 pt-3 pb-1 flex-shrink-0">
          <input
            ref={titleRef}
            type="text"
            value={note.title}
            onChange={handleTitleChange}
            placeholder="Untitled"
            className="w-full bg-transparent text-xl font-bold font-mono text-text
                       placeholder-text-muted/30 border-none outline-none caret-accent"
          />
        </div>

        {/* ── Tags ────────────────────────────────────────────────────── */}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 px-4 pb-2 flex-shrink-0">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs font-mono text-accent/70 bg-accent/5 border border-accent/20 px-1.5 py-0.5 rounded"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* ── Meta ────────────────────────────────────────────────────── */}
        <div className="px-4 pb-2 flex-shrink-0">
          <span className="text-xs font-mono text-text-muted/50">
            {format(new Date(note.updated), 'MMM d, yyyy · HH:mm')}
          </span>
        </div>

        {/* ── Editor / Raw ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          {rawMode ? (
            <textarea
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              onBlur={() => {
                if (activeSection && activeSection.content !== rawContent) {
                  updateNote(note.id, {
                    sections: note.sections.map((s) =>
                      s.id === activeSection.id ? { ...s, content: rawContent } : s,
                    ),
                  })
                }
              }}
              className="w-full h-full p-4 bg-transparent text-sm font-mono text-text
                         border-none outline-none resize-none caret-accent leading-relaxed"
              spellCheck={false}
            />
          ) : (
            <Editor
              key={`${note.id}-${activeSection?.id ?? 'none'}`}
              content={activeSection?.content ?? ''}
              onChange={handleSectionContentChange}
              placeholder={`${activeSection?.name ?? 'Section'} — start writing...`}
            />
          )}
        </div>
      </div>
    </>
  )
}
