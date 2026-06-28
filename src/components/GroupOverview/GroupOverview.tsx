import { useEffect, useMemo, useRef, useState } from 'react'
import {
  X, Folder, Plus, FolderPlus, FileText, Archive, StretchHorizontal,
  Star, StarOff, Trash2, FolderInput, ChevronRight, FolderMinus, Pencil,
} from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { useSidebarGroups } from '../Sidebar/useSidebarGroups'
import { NoteContextMenu, type NoteContextMenuRequest } from '../NoteContextMenu'
import { ConfirmModal } from '../ConfirmModal'
import { OverviewNoteCard } from '../OverviewNoteCard'
import type { GroupColor, NoteGroup, NoteFolder } from '../../types'

interface GroupOverviewProps {
  groupId: string
  onClose: () => void
}

const ROOT_BAND = '__root__'

// Card width range (px) for the responsive grid; persisted across sessions.
const CARD_WIDTH_MIN = 190
const CARD_WIDTH_MAX = 560
const CARD_WIDTH_STORAGE_KEY = 'noteflow:group-view-card-width'

function loadCardWidth(): number {
  const raw = Number(localStorage.getItem(CARD_WIDTH_STORAGE_KEY))
  if (!Number.isFinite(raw) || raw <= 0) return CARD_WIDTH_MIN
  return Math.min(CARD_WIDTH_MAX, Math.max(CARD_WIDTH_MIN, raw))
}

export function GroupOverview({ groupId, onClose }: GroupOverviewProps) {
  const notes = useNotesStore((s) => s.notes)
  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const createNote = useNotesStore((s) => s.createNote)
  const updateNote = useNotesStore((s) => s.updateNote)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const archiveNote = useNotesStore((s) => s.archiveNote)

  const groups = useGroupsStore((s) => s.groups)
  const folders = useGroupsStore((s) => s.folders)
  const createFolder = useGroupsStore((s) => s.createFolder)
  const renameFolder = useGroupsStore((s) => s.renameFolder)
  const deleteFolder = useGroupsStore((s) => s.deleteFolder)
  const renameGroup = useGroupsStore((s) => s.renameGroup)
  const toggleGroupArchived = useGroupsStore((s) => s.toggleGroupArchived)
  const noteOrder = useGroupsStore((s) => s.noteOrder)
  const setContextNoteOrder = useGroupsStore((s) => s.setContextNoteOrder)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)

  const [dragOverBand, setDragOverBand] = useState<string | null>(null)
  // In-band reorder: which card we're hovering and on which side to drop.
  const [noteDropTarget, setNoteDropTarget] = useState<{ noteId: string; position: 'before' | 'after' } | null>(null)
  const draggingNoteIdRef = useRef<string | null>(null)
  const draggingNoteContextRef = useRef<string | null>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [cardWidth, setCardWidth] = useState(loadCardWidth)
  const [contextMenu, setContextMenu] = useState<NoteContextMenuRequest | null>(null)
  // Multi-select: ids of the notes ticked for a batch action.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Inline rename state for the group title and folder bands.
  const [editingGroup, setEditingGroup] = useState(false)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')
  const [folderToDelete, setFolderToDelete] = useState<NoteFolder | null>(null)

  const updateCardWidth = (value: number) => {
    setCardWidth(value)
    localStorage.setItem(CARD_WIDTH_STORAGE_KEY, String(value))
  }

  // Hide archived notes; favorited first, then most-recently updated (same as the sidebar).
  // useSidebarGroups preserves input order within each band.
  const visibleNotes = useMemo(
    () =>
      notes
        .filter((n) => !n.archived)
        .sort((a, b) => {
          if (a.favorited !== b.favorited) return a.favorited ? -1 : 1
          return new Date(b.updated).getTime() - new Date(a.updated).getTime()
        }),
    [notes],
  )

  const items = useSidebarGroups(visibleNotes, groups, folders, noteOrder)

  const selectedNotes = useMemo(
    () => notes.filter((n) => selectedIds.has(n.id)),
    [notes, selectedIds],
  )

  // Archived notes of this group, shown as their own band (kept out of the folder bands above)
  const archivedNotes = useMemo(
    () =>
      notes
        .filter((n) => n.archived && n.group === groupId)
        .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()),
    [notes, groupId],
  )
  const groupItem = items.find(
    (i): i is Extract<typeof items[number], { kind: 'group' }> =>
      i.kind === 'group' && i.group.id === groupId,
  )

  // Group vanished (deleted locally or via sync) → close the overview
  useEffect(() => {
    if (!groupItem) onClose()
  }, [groupItem, onClose])

  // Escape clears an active selection first; otherwise closes the overview.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Let inline-edit inputs handle their own Escape (cancel) without closing.
      if (editingGroup || editingFolderId !== null || showNewFolder) return
      e.preventDefault()
      if (selectedIds.size > 0) setSelectedIds(new Set())
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, selectedIds, editingGroup, editingFolderId, showNewFolder])

  if (!groupItem) return null

  const { group, notes: looseNotes, folders: groupFolders, visibleCount } = groupItem
  const color = group.color

  const openNote = (id: string) => {
    setOpenNoteIds([id])
    setActiveNote(id) // also clears groupViewId → returns to editor
  }

  const startGroupRename = () => {
    setGroupNameDraft(group.name)
    setEditingGroup(true)
  }

  const commitGroupRename = () => {
    const name = groupNameDraft.trim()
    setEditingGroup(false)
    if (name && name !== group.name) void renameGroup(groupId, name)
  }

  const startFolderRename = (folder: NoteFolder) => {
    setEditingFolderName(folder.name)
    setEditingFolderId(folder.id)
  }

  const commitFolderRename = (id: string) => {
    const name = editingFolderName.trim()
    setEditingFolderId(null)
    if (name) void renameFolder(id, name)
  }

  const confirmFolderDelete = () => {
    if (!folderToDelete) return
    const id = folderToDelete.id
    setFolderToDelete(null)
    void deleteFolder(id)
  }

  // Navigate straight to a clicked section. Stash it in pendingInitialSectionId so the editor
  // (which mounts fresh once the overview closes) opens on the right section with no flash.
  // Under StrictMode the editor's mount effect runs twice and consumes that value on the first
  // run, falling back to the first section on the second — so we also re-assert the target via
  // the request-section event once the editor is mounted and listening (next macrotask).
  const openSection = (noteId: string, sectionId: string) => {
    useNotesStore.setState({ pendingInitialSectionId: sectionId })
    setOpenNoteIds([noteId])
    setActiveNote(noteId)
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('noteflow:request-section', { detail: { noteId, sectionId } }),
      )
    }, 0)
  }

  // ── Multi-select ──────────────────────────────────────────────────────────
  const selectionActive = selectedIds.size > 0

  const toggleSelected = (noteId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  // Favorite/archive act as a toggle: if every selected note already has the
  // flag, turn it off; otherwise turn it on for the whole selection.
  const batchFavorite = () => {
    if (selectedNotes.length === 0) return
    const target = !selectedNotes.every((n) => n.favorited)
    selectedNotes.forEach((n) => {
      if (!!n.favorited !== target) void updateNote(n.id, { favorited: target })
    })
    clearSelection()
  }

  const batchArchive = () => {
    if (selectedNotes.length === 0) return
    const target = !selectedNotes.every((n) => n.archived)
    selectedNotes.forEach((n) => {
      if (!!n.archived !== target) void archiveNote(n.id)
    })
    clearSelection()
  }

  const batchMoveToGroup = (targetGroupId: string | undefined) => {
    selectedNotes.forEach((n) => {
      if ((n.group ?? undefined) === targetGroupId && !n.folder) return
      void updateNote(n.id, { group: targetGroupId, folder: undefined })
    })
    clearSelection()
  }

  const batchMoveToFolder = (targetFolder: string | undefined) => {
    selectedNotes.forEach((n) => {
      if (n.group === groupId && (n.folder ?? undefined) === targetFolder) return
      void updateNote(n.id, { group: groupId, folder: targetFolder })
    })
    clearSelection()
  }

  const batchDelete = () => {
    const ids = selectedNotes.map((n) => n.id)
    clearSelection()
    setConfirmDelete(false)
    ids.forEach((id) => void deleteNote(id))
  }

  const moveToBand = (noteId: string, band: string) => {
    const note = notes.find((n) => n.id === noteId)
    if (!note) return
    const targetFolder = band === ROOT_BAND ? undefined : band
    // No-op if it's already where it landed
    if (note.group === groupId && (note.folder ?? undefined) === targetFolder) return
    void updateNote(noteId, { group: groupId, folder: targetFolder })
  }

  const onBandDrop = (e: React.DragEvent, band: string) => {
    e.preventDefault()
    e.stopPropagation()
    const noteId =
      e.dataTransfer.getData('application/x-noteflow-note-id') ||
      e.dataTransfer.getData('text/plain')
    setDragOverBand(null)
    if (noteId) moveToBand(noteId, band)
  }

  const onBandDragOver = (e: React.DragEvent, band: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverBand !== band) setDragOverBand(band)
  }

  const onBandDragLeave = (e: React.DragEvent, band: string) => {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    if (dragOverBand === band) setDragOverBand(null)
  }

  // Context key for the manual-order store, matching the sidebar conventions:
  // group root → `group:<id>`, folder → `folder:<id>`.
  const bandContextKey = (band: string) =>
    band === ROOT_BAND ? `group:${groupId}` : `folder:${band}`

  const onNoteDragStart = (noteId: string, band: string) => {
    draggingNoteIdRef.current = noteId
    draggingNoteContextRef.current = bandContextKey(band)
  }

  const onNoteDragEnd = () => {
    draggingNoteIdRef.current = null
    draggingNoteContextRef.current = null
    setNoteDropTarget(null)
  }

  // Reorder hover — only within the same band; cross-band drags bubble to the band (move).
  const onNoteReorderDragOver = (e: React.DragEvent, noteId: string, band: string) => {
    if (!draggingNoteIdRef.current) return
    if (draggingNoteContextRef.current !== bandContextKey(band)) return
    if (draggingNoteIdRef.current === noteId) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const position: 'before' | 'after' = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
    setNoteDropTarget((prev) =>
      prev?.noteId === noteId && prev.position === position ? prev : { noteId, position },
    )
  }

  const onNoteReorderDrop = (e: React.DragEvent, targetNoteId: string, band: string) => {
    const contextKey = bandContextKey(band)
    // Only handle same-band reorders here; let cross-band drops bubble to the band (move).
    if (draggingNoteContextRef.current !== contextKey) return
    e.preventDefault()
    e.stopPropagation()
    const draggedId =
      e.dataTransfer.getData('application/x-noteflow-note-id') ||
      e.dataTransfer.getData('text/plain')
    const position = noteDropTarget?.noteId === targetNoteId ? noteDropTarget.position : 'after'
    setNoteDropTarget(null)
    if (!draggedId || draggedId === targetNoteId) return

    const bandNotes =
      band === ROOT_BAND
        ? looseNotes
        : groupFolders.find((f) => f.folder.id === band)?.notes ?? []
    const currentIds = bandNotes.map((n) => n.id)
    const without = currentIds.filter((id) => id !== draggedId)
    let targetIndex = without.indexOf(targetNoteId)
    if (targetIndex === -1) return
    if (position === 'after') targetIndex += 1
    without.splice(targetIndex, 0, draggedId)
    void setContextNoteOrder(contextKey, without)
  }

  const handleNewNote = async () => {
    const note = await createNote()
    await updateNote(note.id, { group: groupId })
    openNote(note.id)
  }

  const commitNewFolder = async () => {
    const name = newFolderName.trim()
    setShowNewFolder(false)
    setNewFolderName('')
    if (name) await createFolder(groupId, name)
  }

  const folderCount = groupFolders.length

  return (
    <div
      className="h-full w-full flex flex-col"
      style={{ background: 'rgb(var(--bg-editor))' }}
      // Catch drops that miss a band so they don't bubble to the editor split handler
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverBand(null) }}
    >
      <NoteContextMenu request={contextMenu} onClose={() => setContextMenu(null)} />

      {/* ── Header (fixed — outside the scroll area so the scrollbar starts below it) ── */}
      <div
        className="flex-shrink-0 z-10 flex items-center gap-3 px-6 py-4 border-b border-border"
        style={{ background: 'rgb(var(--bg-1) / 0.85)' }}
      >
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: `rgb(var(${color}))` }}
        />
        {editingGroup ? (
          <input
            autoFocus
            value={groupNameDraft}
            onChange={(e) => setGroupNameDraft(e.target.value)}
            onBlur={commitGroupRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitGroupRename()
              if (e.key === 'Escape') setEditingGroup(false)
            }}
            className="min-w-0 max-w-xs text-sm font-mono uppercase tracking-wider bg-surface-1 border border-text/25 rounded px-1.5 py-0.5 outline-none text-text"
          />
        ) : (
          <div className="group/title flex items-center gap-1.5 min-w-0">
            <h1
              className="text-sm font-mono uppercase tracking-wider text-text truncate cursor-text"
              onDoubleClick={startGroupRename}
              title="Double-click to rename"
            >
              {group.name}
            </h1>
            <button
              onClick={startGroupRename}
              className="flex-shrink-0 text-text-muted hover:text-text opacity-0 group-hover/title:opacity-100 transition-opacity"
              title="Rename group"
            >
              <Pencil size={12} />
            </button>
          </div>
        )}
        {group.archived && (
          <button
            onClick={() => toggleGroupArchived(group.id)}
            title="Unarchive group"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-surface-2 text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-text hover:border-accent/50 transition-colors flex-shrink-0"
          >
            <Archive size={11} /> Archived
          </button>
        )}
        <span className="text-[11px] font-mono text-text-muted/60 flex-shrink-0">
          {visibleCount} {visibleCount === 1 ? 'note' : 'notes'}
          {folderCount > 0 && ` · ${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`}
        </span>

        <div className="flex-1" />

        {/* Card width control — wider cards reveal more sections at once (kept subtle) */}
        <div
          className="flex items-center gap-1 mr-2 opacity-35 hover:opacity-100 transition-opacity"
          title="Card width"
        >
          <StretchHorizontal size={12} className="text-text-muted flex-shrink-0" />
          <input
            type="range"
            min={CARD_WIDTH_MIN}
            max={CARD_WIDTH_MAX}
            step={10}
            value={cardWidth}
            onChange={(e) => updateCardWidth(Number(e.target.value))}
            className="w-16 h-0.5 accent-text-muted cursor-pointer"
            aria-label="Card width"
          />
        </div>

        <button
          onClick={handleNewNote}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-surface-2 text-[11px] font-mono text-text-muted hover:text-text hover:border-text/25 transition-colors"
          title="New note in this group"
        >
          <Plus size={12} /> New note
        </button>
        <button
          onClick={() => { setShowNewFolder(true); setNewFolderName('') }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-surface-2 text-[11px] font-mono text-text-muted hover:text-text hover:border-text/25 transition-colors"
          title="New folder"
        >
          <FolderPlus size={12} /> New folder
        </button>
        <button
          onClick={onClose}
          className="ml-1 flex items-center justify-center w-7 h-7 rounded border border-border bg-surface-2 text-text-muted hover:text-text hover:border-text/25 transition-colors"
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Scroll area (only this scrolls — the scrollbar starts below the header) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto relative">
      <div className="px-6 py-5 space-y-6">
        {/* Inline new-folder input */}
        {showNewFolder && (
          <div className="flex items-center gap-2">
            <FolderPlus size={14} style={{ color: `rgb(var(${color}))` }} />
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={commitNewFolder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitNewFolder()
                if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') }
              }}
              placeholder="Folder name…"
              className="flex-1 max-w-xs text-xs font-mono bg-surface-1 border border-text/25 rounded px-2 py-1 outline-none text-text"
            />
          </div>
        )}

        {visibleCount === 0 && groupFolders.length === 0 && archivedNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <FileText size={28} className="text-text-muted/40" />
            <p className="text-sm font-mono text-text-muted">This group is empty</p>
            <button
              onClick={handleNewNote}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-xs font-mono text-text-muted hover:text-text hover:border-text/25 transition-colors"
            >
              <Plus size={13} /> New note
            </button>
          </div>
        ) : (
          <>
            {/* One band per folder */}
            {groupFolders.map(({ folder, notes: folderNotes }) => (
              <Band
                key={folder.id}
                label={folder.name}
                count={folderNotes.length}
                color={color}
                isFolder
                cardWidth={cardWidth}
                active={dragOverBand === folder.id}
                onDragOver={(e) => onBandDragOver(e, folder.id)}
                onDragLeave={(e) => onBandDragLeave(e, folder.id)}
                onDrop={(e) => onBandDrop(e, folder.id)}
                editing={editingFolderId === folder.id}
                editValue={editingFolderName}
                onEditChange={setEditingFolderName}
                onEditCommit={() => commitFolderRename(folder.id)}
                onEditCancel={() => setEditingFolderId(null)}
                onStartRename={() => startFolderRename(folder)}
                onDelete={() => setFolderToDelete(folder)}
              >
                {folderNotes.map((note) => (
                  <OverviewNoteCard
                    key={note.id}
                    note={note}
                    color={color}
                    sectionTagColors={sectionTagColors}
                    onOpen={openNote}
                    onOpenSection={openSection}
                    onContextMenu={setContextMenu}
                    selected={selectedIds.has(note.id)}
                    selectionActive={selectionActive}
                    onToggleSelect={toggleSelected}
                    dropIndicator={noteDropTarget?.noteId === note.id ? noteDropTarget.position : null}
                    onReorderDragStart={() => onNoteDragStart(note.id, folder.id)}
                    onReorderDragEnd={onNoteDragEnd}
                    onReorderDragOver={(e) => onNoteReorderDragOver(e, note.id, folder.id)}
                    onReorderDrop={(e) => onNoteReorderDrop(e, note.id, folder.id)}
                  />
                ))}
              </Band>
            ))}

            {/* Loose notes (group root) */}
            {(looseNotes.length > 0 || groupFolders.length > 0) && (
              <Band
                label="No folder"
                count={looseNotes.length}
                color={color}
                isFolder={false}
                cardWidth={cardWidth}
                active={dragOverBand === ROOT_BAND}
                onDragOver={(e) => onBandDragOver(e, ROOT_BAND)}
                onDragLeave={(e) => onBandDragLeave(e, ROOT_BAND)}
                onDrop={(e) => onBandDrop(e, ROOT_BAND)}
              >
                {looseNotes.map((note) => (
                  <OverviewNoteCard
                    key={note.id}
                    note={note}
                    color={color}
                    sectionTagColors={sectionTagColors}
                    onOpen={openNote}
                    onOpenSection={openSection}
                    onContextMenu={setContextMenu}
                    selected={selectedIds.has(note.id)}
                    selectionActive={selectionActive}
                    onToggleSelect={toggleSelected}
                    dropIndicator={noteDropTarget?.noteId === note.id ? noteDropTarget.position : null}
                    onReorderDragStart={() => onNoteDragStart(note.id, ROOT_BAND)}
                    onReorderDragEnd={onNoteDragEnd}
                    onReorderDragOver={(e) => onNoteReorderDragOver(e, note.id, ROOT_BAND)}
                    onReorderDrop={(e) => onNoteReorderDrop(e, note.id, ROOT_BAND)}
                  />
                ))}
              </Band>
            )}

            {/* Archived notes of this group (read-only band — not a drop target) */}
            {archivedNotes.length > 0 && (
              <Band
                label="Archived"
                count={archivedNotes.length}
                color={color}
                isFolder={false}
                cardWidth={cardWidth}
                icon={<Archive size={13} className="flex-shrink-0 text-text-muted/60" />}
              >
                {archivedNotes.map((note) => (
                  <OverviewNoteCard
                    key={note.id}
                    note={note}
                    color={color}
                    sectionTagColors={sectionTagColors}
                    onOpen={openNote}
                    onOpenSection={openSection}
                    onContextMenu={setContextMenu}
                    selected={selectedIds.has(note.id)}
                    selectionActive={selectionActive}
                    onToggleSelect={toggleSelected}
                  />
                ))}
              </Band>
            )}
          </>
        )}
      </div>

      {/* Floating batch-action bar — sticks to the bottom while scrolling */}
      {selectionActive && (
        <div className="sticky bottom-0 z-20 pointer-events-none flex justify-center px-6 pb-5">
          <SelectionBar
            count={selectedNotes.length}
            allFavorited={selectedNotes.length > 0 && selectedNotes.every((n) => n.favorited)}
            allArchived={selectedNotes.length > 0 && selectedNotes.every((n) => n.archived)}
            groups={groups}
            currentGroupId={groupId}
            currentGroupFolders={groupFolders.map((f) => f.folder)}
            onFavorite={batchFavorite}
            onArchive={batchArchive}
            onMoveToGroup={batchMoveToGroup}
            onMoveToFolder={batchMoveToFolder}
            onDelete={() => setConfirmDelete(true)}
            onClear={clearSelection}
          />
        </div>
      )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={selectedNotes.length === 1 ? 'Delete note' : 'Delete notes'}
          message={
            selectedNotes.length === 1
              ? `"${selectedNotes[0]?.title || 'Untitled'}" will be permanently deleted.`
              : `${selectedNotes.length} notes will be permanently deleted.`
          }
          confirmLabel="Delete"
          danger
          onConfirm={batchDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {folderToDelete && (
        <ConfirmModal
          title="Delete folder"
          message={`"${folderToDelete.name}" will be deleted. Notes inside will move to the group root.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmFolderDelete}
          onCancel={() => setFolderToDelete(null)}
        />
      )}
    </div>
  )
}

// ── Band (folder section / loose notes / archived) ───────────────────────────
interface BandProps {
  label: string
  count: number
  color: GroupColor
  isFolder: boolean
  cardWidth: number
  active?: boolean
  icon?: React.ReactNode  // overrides the default folder/dot marker (e.g. Archive)
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  // Folder rename/delete (only wired for folder bands)
  editing?: boolean
  editValue?: string
  onEditChange?: (value: string) => void
  onEditCommit?: () => void
  onEditCancel?: () => void
  onStartRename?: () => void
  onDelete?: () => void
  children: React.ReactNode
}

function Band({
  label, count, color, isFolder, cardWidth, active, icon,
  onDragOver, onDragLeave, onDrop,
  editing, editValue, onEditChange, onEditCommit, onEditCancel, onStartRename, onDelete,
  children,
}: BandProps) {
  const droppable = Boolean(onDrop)
  const hasFolderActions = isFolder && Boolean(onStartRename || onDelete)
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-lg border transition-colors ${active ? 'border-text/25 bg-text/5' : 'border-transparent'}`}
    >
      <div className={`group/band flex items-center px-1 ${isFolder ? 'gap-2 pt-1 pb-2.5' : 'gap-1.5 py-1.5'}`}>
        {icon ? (
          icon
        ) : isFolder ? (
          <Folder
            size={18}
            className="flex-shrink-0"
            fill={`rgb(var(${color}) / 0.18)`}
            style={{ color: `rgb(var(${color}))` }}
          />
        ) : (
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: `rgb(var(${color}) / 0.5)` }} />
        )}
        {isFolder ? (
          editing ? (
            <input
              autoFocus
              value={editValue ?? ''}
              onChange={(e) => onEditChange?.(e.target.value)}
              onBlur={onEditCommit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onEditCommit?.()
                if (e.key === 'Escape') onEditCancel?.()
              }}
              className="min-w-0 max-w-xs text-[17px] font-semibold tracking-tight bg-surface-1 border border-text/25 rounded px-1.5 py-0.5 outline-none text-text"
            />
          ) : (
            <h2 className="text-[17px] font-semibold tracking-tight text-text truncate">{label}</h2>
          )
        ) : (
          <span className="text-[11.5px] font-mono font-medium truncate text-text-muted">{label}</span>
        )}
        <span
          className={
            isFolder
              ? 'text-[10px] font-mono text-text-muted/60 px-1.5 py-0.5 rounded-full bg-text/5'
              : 'text-[10px] font-mono text-text-muted/50'
          }
        >
          {count}
        </span>
        {hasFolderActions && !editing && (
          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/band:opacity-100 transition-opacity">
            {onStartRename && (
              <button
                onClick={onStartRename}
                title="Rename folder"
                className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text hover:bg-text/10 transition-colors"
              >
                <Pencil size={13} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                title="Delete folder"
                className="flex items-center justify-center w-6 h-6 rounded text-red/75 hover:text-red hover:bg-red/10 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="grid gap-3 mt-1" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))` }}>
        {count === 0 ? (
          <p className="text-[11px] font-mono text-text-muted/40 px-1 py-3">
            {droppable ? 'Empty — drop a note here' : 'Empty'}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

// ── Selection action bar ──────────────────────────────────────────────────────
interface SelectionBarProps {
  count: number
  allFavorited: boolean
  allArchived: boolean
  groups: NoteGroup[]
  currentGroupId: string
  currentGroupFolders: NoteFolder[]
  onFavorite: () => void
  onArchive: () => void
  onMoveToGroup: (groupId: string | undefined) => void
  onMoveToFolder: (folderId: string | undefined) => void
  onDelete: () => void
  onClear: () => void
}

function SelectionBar({
  count,
  allFavorited,
  allArchived,
  groups,
  currentGroupId,
  currentGroupFolders,
  onFavorite,
  onArchive,
  onMoveToGroup,
  onMoveToFolder,
  onDelete,
  onClear,
}: SelectionBarProps) {
  const [picker, setPicker] = useState<'group' | 'folder' | null>(null)

  // Close the open picker on outside click.
  useEffect(() => {
    if (!picker) return
    const close = () => setPicker(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [picker])

  const btn =
    'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-mono text-text-muted hover:text-text hover:bg-text/10 transition-colors'

  return (
    <div
      className="pointer-events-auto relative flex items-center gap-1 rounded-lg border border-border bg-surface-2/95 backdrop-blur px-2 py-1.5 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="px-2 text-[11px] font-mono text-text whitespace-nowrap">
        {count} selected
      </span>
      <div className="w-px h-5 bg-border mx-0.5" />

      <button onClick={onFavorite} className={btn} title={allFavorited ? 'Remove from favorites' : 'Add to favorites'}>
        {allFavorited ? <StarOff size={13} /> : <Star size={13} />}
        {allFavorited ? 'Unfavorite' : 'Favorite'}
      </button>

      <button onClick={onArchive} className={btn} title={allArchived ? 'Unarchive' : 'Archive'}>
        <Archive size={13} />
        {allArchived ? 'Unarchive' : 'Archive'}
      </button>

      {/* Move to group */}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setPicker((p) => (p === 'group' ? null : 'group')) }}
          className={btn}
          title="Move to group"
        >
          <FolderInput size={13} />
          Move to group
          <ChevronRight size={10} className="rotate-90 opacity-60" />
        </button>
        {picker === 'group' && (
          <div className="absolute bottom-full left-0 mb-1.5 w-44 max-h-64 overflow-y-auto bg-surface-2 border border-border rounded shadow-xl py-1 animate-in fade-in zoom-in duration-100">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => { onMoveToGroup(g.id) }}
                className={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-2 transition-colors hover:bg-surface-3 hover:text-text ${g.id === currentGroupId ? 'text-text' : 'text-text-muted'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: `rgb(var(${g.color}))` }} />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
            <div className="h-px bg-border my-1" />
            <button
              onClick={() => { onMoveToGroup(undefined) }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-muted hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <FolderMinus size={12} />
              No group
            </button>
          </div>
        )}
      </div>

      {/* Move to folder (within the current group) */}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setPicker((p) => (p === 'folder' ? null : 'folder')) }}
          className={btn}
          title="Move to folder in this group"
        >
          <Folder size={13} />
          Move to folder
          <ChevronRight size={10} className="rotate-90 opacity-60" />
        </button>
        {picker === 'folder' && (
          <div className="absolute bottom-full left-0 mb-1.5 w-44 max-h-64 overflow-y-auto bg-surface-2 border border-border rounded shadow-xl py-1 animate-in fade-in zoom-in duration-100">
            <button
              onClick={() => { onMoveToFolder(undefined) }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-muted hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <FolderMinus size={12} />
              Group root
            </button>
            {currentGroupFolders.map((f) => (
              <button
                key={f.id}
                onClick={() => { onMoveToFolder(f.id) }}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-muted hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
              >
                <Folder size={12} className="flex-shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
            {currentGroupFolders.length === 0 && (
              <div className="px-3 py-1.5 text-[10px] font-mono text-text-muted/60">No folders yet</div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-mono text-red/75 hover:text-red hover:bg-red/10 transition-colors"
        title="Delete selected"
      >
        <Trash2 size={13} />
        Delete
      </button>

      <div className="w-px h-5 bg-border mx-0.5" />
      <button
        onClick={onClear}
        className="flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text hover:bg-text/10 transition-colors"
        title="Clear selection (Esc)"
      >
        <X size={14} />
      </button>
    </div>
  )
}
