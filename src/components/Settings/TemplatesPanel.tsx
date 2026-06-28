import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Check, FilePlus2, LayoutTemplate, Pencil, Trash2 } from 'lucide-react'
import { useTemplatesStore } from '../../stores/templatesStore'
import { useNotesStore } from '../../stores/notesStore'
import type { NoteTemplate } from '../../types'
import { ConfirmModal } from '../ConfirmModal'

export function TemplatesPanel({ onClose }: { onClose: () => void }) {
  const templates = useTemplatesStore((s) => s.templates)
  const renameTemplate = useTemplatesStore((s) => s.renameTemplate)
  const deleteTemplate = useTemplatesStore((s) => s.deleteTemplate)
  const createPopulatedNote = useNotesStore((s) => s.createPopulatedNote)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<NoteTemplate | null>(null)

  const startRename = (tpl: NoteTemplate) => {
    setEditingId(tpl.id)
    setDraftName(tpl.name)
  }

  const commitRename = async () => {
    if (!editingId) return
    const name = draftName.trim()
    if (name) await renameTemplate(editingId, name)
    setEditingId(null)
  }

  const createFromTemplate = async (tpl: NoteTemplate) => {
    const sections =
      tpl.sections.length > 0
        ? tpl.sections.map((s) => ({ ...s, id: nanoid(6) }))
        : [{ id: nanoid(6), name: 'Notes', content: '' }]
    await createPopulatedNote({ title: tpl.title, sections })
    onClose()
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-mono font-medium text-text">Note templates</p>
        <p className="text-[11px] font-mono text-text-muted mt-0.5 max-w-md leading-relaxed">
          Reusable notes with predefined sections. Open a note's ⋯ menu and choose
          "Save as template" to add one here.
        </p>

        {templates.length === 0 ? (
          <p className="mt-4 text-xs font-mono text-text-muted/70 leading-relaxed">
            No templates yet. Open a note's ⋯ menu and choose "Save as template".
          </p>
        ) : (
          <div className="mt-4 space-y-1.5">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center gap-2 px-2.5 py-2 rounded bg-surface-2 border border-border"
              >
                <LayoutTemplate size={13} className="flex-shrink-0 text-text-muted" />

                {editingId === tpl.id ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); void commitRename() }
                      if (e.key === 'Escape') { e.preventDefault(); setEditingId(null) }
                    }}
                    onBlur={() => void commitRename()}
                    className="flex-1 min-w-0 bg-surface-1 border border-border rounded px-2 py-1
                               text-xs font-mono text-text focus:outline-none focus:border-text/30"
                  />
                ) : (
                  <button
                    onDoubleClick={() => startRename(tpl)}
                    onClick={() => void createFromTemplate(tpl)}
                    title="Create a note from this template"
                    className="flex-1 min-w-0 text-left text-xs font-mono text-text truncate hover:text-accent transition-colors"
                  >
                    {tpl.name}
                  </button>
                )}

                {editingId === tpl.id ? (
                  <button
                    onClick={() => void commitRename()}
                    title="Save name"
                    className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
                  >
                    <Check size={13} />
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => void createFromTemplate(tpl)}
                      title="New note from template"
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono
                                 text-text-muted border border-border hover:text-text hover:border-text/25 transition-colors"
                    >
                      <FilePlus2 size={12} />
                      New note
                    </button>
                    <button
                      onClick={() => startRename(tpl)}
                      title="Rename template"
                      className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setPendingDelete(tpl)}
                      title="Delete template"
                      className="p-1 rounded text-text-muted hover:text-red hover:bg-red/10 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {pendingDelete && (
        <ConfirmModal
          title="Delete template"
          message={`Delete the template "${pendingDelete.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            void deleteTemplate(pendingDelete.id)
            setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
