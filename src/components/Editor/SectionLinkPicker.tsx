import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, Link2 } from 'lucide-react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import { useNotesStore } from '../../stores/notesStore'
import { useSectionHoverPreview } from '../../components/SectionPreview/hoverPreviewContext'

interface SectionOption {
  noteId: string
  noteTitle: string
  sectionId: string
  sectionName: string
}

interface SectionLinkPickerProps {
  editor: TiptapEditor
  onClose: () => void
  /** Section currently being edited — excluded so you can't link a section to itself. */
  currentSectionId?: string | null
}

// Searchable overlay for picking a target section to relate to. Lists every
// section of every (non-encrypted, non-archived, non-temporary) note. On pick it
// inserts the relation pill into the editor at the current selection.
export function SectionLinkPicker({ editor, onClose, currentSectionId }: SectionLinkPickerProps) {
  const notes = useNotesStore((s) => s.notes)
  const { previewProps } = useSectionHoverPreview()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const options = useMemo<SectionOption[]>(() => {
    const out: SectionOption[] = []
    for (const note of notes) {
      if (note.archived || note.encryption || note.expiresAt) continue
      for (const section of note.sections) {
        if (section.id === currentSectionId) continue
        out.push({
          noteId: note.id,
          noteTitle: note.title?.trim() || 'Untitled',
          sectionId: section.id,
          sectionName: section.name?.trim() || 'Section',
        })
      }
    }
    return out
  }, [notes, currentSectionId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.sectionName.toLowerCase().includes(q) || o.noteTitle.toLowerCase().includes(q),
    )
  }, [options, query])

  const choose = (opt: SectionOption) => {
    editor
      .chain()
      .focus()
      .insertSectionRelation({
        noteId: opt.noteId,
        sectionId: opt.sectionId,
        sectionName: opt.sectionName,
      })
      .run()
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[selected]
      if (opt) choose(opt)
    }
  }

  // Keep the highlighted row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/40 pt-[12vh]"
      onMouseDown={onClose}
    >
      <div
        className="w-[min(520px,92vw)] max-h-[60vh] flex flex-col rounded-xl border border-solid
                   border-text/20 bg-surface-1 shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-solid border-text/10">
          <Link2 size={16} className="text-accent shrink-0" />
          <Search size={14} className="text-text/40 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
            placeholder="Link to section…"
            className="flex-1 bg-transparent outline-none text-sm text-text placeholder:text-text/40"
          />
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-text/40">No sections found</div>
          ) : (
            filtered.map((opt, i) => {
              const hp = previewProps(opt.noteId, opt.sectionId)
              return (
              <button
                key={`${opt.noteId}:${opt.sectionId}`}
                type="button"
                data-idx={i}
                title={hp.title}
                onMouseLeave={hp.onMouseLeave}
                onMouseEnter={(e) => { hp.onMouseEnter?.(e); setSelected(i) }}
                onClick={() => choose(opt)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left
                            ${i === selected ? 'bg-text/10' : 'hover:bg-text/5'}`}
              >
                <span className="text-sm text-text truncate">{opt.sectionName}</span>
                <span className="text-xs text-text/45 truncate shrink-0 max-w-[45%]">
                  {opt.noteTitle}
                </span>
              </button>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
