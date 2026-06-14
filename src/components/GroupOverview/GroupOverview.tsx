import { useEffect, useMemo, useState } from 'react'
import { X, Folder, Plus, FolderPlus, FileText, Archive, StretchHorizontal } from 'lucide-react'
import { format } from 'date-fns'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { useSectionTagColorsStore, type SectionTagColorMap } from '../../stores/sectionTagColorsStore'
import { useSidebarGroups } from '../Sidebar/useSidebarGroups'
import { SectionTabsRow } from '../Sidebar/SectionTabsRow'
import type { Note, GroupColor } from '../../types'

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

function formatCardDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return format(d, 'dd/MM/yyyy · HH:mm')
}

export function GroupOverview({ groupId, onClose }: GroupOverviewProps) {
  const notes = useNotesStore((s) => s.notes)
  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const createNote = useNotesStore((s) => s.createNote)
  const updateNote = useNotesStore((s) => s.updateNote)

  const groups = useGroupsStore((s) => s.groups)
  const folders = useGroupsStore((s) => s.folders)
  const createFolder = useGroupsStore((s) => s.createFolder)
  const toggleGroupArchived = useGroupsStore((s) => s.toggleGroupArchived)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)

  const [dragOverBand, setDragOverBand] = useState<string | null>(null)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [cardWidth, setCardWidth] = useState(loadCardWidth)

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

  const items = useSidebarGroups(visibleNotes, groups, folders)

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

  if (!groupItem) return null

  const { group, notes: looseNotes, folders: groupFolders, visibleCount } = groupItem
  const color = group.color

  const openNote = (id: string) => {
    setOpenNoteIds([id])
    setActiveNote(id) // also clears groupViewId → returns to editor
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
      className="h-full w-full overflow-y-auto"
      style={{ background: 'rgb(var(--bg-editor))' }}
      // Catch drops that miss a band so they don't bubble to the editor split handler
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverBand(null) }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-6 py-4 border-b border-border backdrop-blur"
        style={{ background: 'rgb(var(--bg-1) / 0.85)' }}
      >
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: `rgb(var(${color}))` }}
        />
        <h1 className="text-sm font-mono uppercase tracking-wider text-text truncate">
          {group.name}
        </h1>
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
              >
                {folderNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    color={color}
                    sectionTagColors={sectionTagColors}
                    onOpen={openNote}
                    onOpenSection={openSection}
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
                  <NoteCard
                    key={note.id}
                    note={note}
                    color={color}
                    sectionTagColors={sectionTagColors}
                    onOpen={openNote}
                    onOpenSection={openSection}
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
                  <NoteCard
                    key={note.id}
                    note={note}
                    color={color}
                    sectionTagColors={sectionTagColors}
                    onOpen={openNote}
                    onOpenSection={openSection}
                  />
                ))}
              </Band>
            )}
          </>
        )}
      </div>
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
  children: React.ReactNode
}

function Band({ label, count, color, isFolder, cardWidth, active, icon, onDragOver, onDragLeave, onDrop, children }: BandProps) {
  const droppable = Boolean(onDrop)
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-lg border transition-colors ${active ? 'border-text/25 bg-text/5' : 'border-transparent'}`}
    >
      <div className="flex items-center gap-1.5 px-1 py-1.5">
        {icon ? (
          icon
        ) : isFolder ? (
          <Folder
            size={13}
            className="flex-shrink-0"
            fill={`rgb(var(${color}) / 0.18)`}
            style={{ color: `rgb(var(${color}))` }}
          />
        ) : (
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: `rgb(var(${color}) / 0.5)` }} />
        )}
        <span className={`text-[11.5px] font-mono font-medium truncate ${isFolder ? 'text-text/80' : 'text-text-muted'}`}>
          {label}
        </span>
        <span className="text-[10px] font-mono text-text-muted/50">{count}</span>
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

// ── Note card ─────────────────────────────────────────────────────────────────
interface NoteCardProps {
  note: Note
  color: GroupColor
  sectionTagColors: SectionTagColorMap
  onOpen: (id: string) => void
  onOpenSection: (noteId: string, sectionId: string) => void
}

function NoteCard({ note, color, sectionTagColors, onOpen, onOpenSection }: NoteCardProps) {
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-noteflow-note-id', note.id)
        e.dataTransfer.setData('text/plain', note.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onOpen(note.id)}
      className="group relative text-left rounded-md border border-border bg-surface-1 hover:bg-surface-2 hover:border-text/25 transition-colors overflow-hidden p-3 pl-4 flex flex-col gap-2 min-h-[78px]"
      title={note.title || 'Untitled'}
    >
      {/* Group-color accent line */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: `rgb(var(${color}) / 0.55)` }}
      />
      <span className="text-[13px] font-mono font-medium text-text/90 truncate">
        {note.title || 'Untitled'}
      </span>

      <SectionTabsRow
        noteId={note.id}
        sections={note.sections}
        searchQuery=""
        sectionFilter={null}
        sectionTagColors={sectionTagColors}
        onSectionClick={(sectionId, e) => { e.stopPropagation(); onOpenSection(note.id, sectionId) }}
        onSectionContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
        renderHighlightedText={(text) => text}
      />

      <span className="text-[10px] font-mono text-text-muted/50 mt-auto">
        {formatCardDate(note.updated)}
      </span>
    </button>
  )
}
