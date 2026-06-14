import { Fragment, useLayoutEffect, useMemo, useRef, useEffect, useState } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { Archive, ArchiveRestore, Search, Star, StarOff, PanelLeftClose, Trash2, Lock, Unlock, Copy, Columns2, ExternalLink, FolderPlus, FolderMinus, Folder, FolderOpen, ChevronLeft, ChevronRight, CalendarDays, X, Plus, Timer, LayoutGrid } from 'lucide-react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, isYesterday, startOfMonth, startOfWeek } from 'date-fns'
import { ConfirmModal } from '../ConfirmModal'
import { EncryptionModal } from '../EncryptionModal'
import { normalizeTagColorKey, TAG_COLOR_VARS } from '../../lib/tagColors'
import { normalize, escapeRegExp, parseSearchQuery } from '../../lib/searchUtils'
import { NoteGroupHeader } from './NoteGroupHeader'
import { NoteFolderHeader } from './NoteFolderHeader'
import { useSidebarGroups, type SidebarFolder } from './useSidebarGroups'
import { SectionTabsRow } from './SectionTabsRow'
import type { GroupColor } from '../../types'

interface SidebarProps {
  onCollapse: () => void
}

function formatNoteDate(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

function formatExpiry(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  if (diffMs <= 0) return 'expiring soon'
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffH < 1) return `expires in ${Math.ceil(diffMs / (1000 * 60))}m`
  if (diffH < 24) return `expires in ${diffH}h`
  return `expires in ${Math.floor(diffH / 24)}d`
}

function renderHighlightedText(text: string, query: string) {
  const trimmed = query.trim()
  if (!trimmed) return text
  const matcher = new RegExp(`(${escapeRegExp(trimmed)})`, 'ig')
  const parts = text.split(matcher)
  if (parts.length <= 1) return text

  return parts.map((part, index) => (
    index % 2 === 1
      ? (
        <mark key={`${part}-${index}`} className="bg-text/15 text-text rounded px-[1px]">
          {part}
        </mark>
      )
      : <span key={`${part}-${index}`}>{part}</span>
  ))
}

function toDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toDayKeyFromIso(iso: string): string | null {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  return toDayKey(parsed)
}

function dayKeyToDate(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const GROUP_COLORS: GroupColor[] = [...TAG_COLOR_VARS]

// Context menu that measures its own size after rendering and shifts itself back
// into the viewport when it would overflow — the menu's height varies (encryption
// state, section colors, group submenus…), so a fixed height estimate can't reliably
// keep the bottom options visible.
function ContextMenu({ x, y, className, children }: {
  x: number
  y: number
  className: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const margin = 8
    const { width, height } = el.getBoundingClientRect()
    let left = x
    let top = y
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - height - margin)
    }
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - width - margin)
    }
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }))
  })

  return (
    <div
      ref={ref}
      className={className}
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

export function Sidebar({ onCollapse }: SidebarProps) {
  const rawNotes = useNotesStore((s) => s.notes)
  const activeNoteId = useNotesStore((s) => s.activeNoteId)
  const searchQuery = useNotesStore((s) => s.searchQuery)
  const filterDate = useNotesStore((s) => s.filterDate)
  const filterTag = useNotesStore((s) => s.filterTag)
  const showArchived = useNotesStore((s) => s.showArchived)

  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const setGroupView = useNotesStore((s) => s.setGroupView)
  const setNoteView = useNotesStore((s) => s.setNoteView)
  const updateNote = useNotesStore((s) => s.updateNote)
  const archiveNote = useNotesStore((s) => s.archiveNote)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const encryptNote = useNotesStore((s) => s.encryptNote)
  const unlockNote = useNotesStore((s) => s.unlockNote)
  const lockNote = useNotesStore((s) => s.lockNote)
  const removeNoteEncryption = useNotesStore((s) => s.removeNoteEncryption)
  const sessionPasswords = useNotesStore((s) => s.sessionPasswords)
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery)
  const setFilterDate = useNotesStore((s) => s.setFilterDate)
  const setShowArchived = useNotesStore((s) => s.setShowArchived)
  const setOpenNoteIds = useNotesStore((s) => s.setOpenNoteIds)
  const openNoteInSplit = useNotesStore((s) => s.openNoteInSplit)
  const createNote = useNotesStore((s) => s.createNote)
  const createTempNote = useNotesStore((s) => s.createTempNote)
  const duplicateNote = useNotesStore((s) => s.duplicateNote)

  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const setSectionTagColor = useSectionTagColorsStore((s) => s.setSectionTagColor)
  const clearSectionTagColor = useSectionTagColorsStore((s) => s.clearSectionTagColor)

  const groups = useGroupsStore((s) => s.groups)
  const folders = useGroupsStore((s) => s.folders)
  const collapsedGroupIds = useGroupsStore((s) => s.collapsedGroupIds)
  const collapsedFolderIds = useGroupsStore((s) => s.collapsedFolderIds)
  const createGroup = useGroupsStore((s) => s.createGroup)
  const renameGroup = useGroupsStore((s) => s.renameGroup)
  const toggleGroupArchived = useGroupsStore((s) => s.toggleGroupArchived)
  const deleteGroup = useGroupsStore((s) => s.deleteGroup)
  const reorderGroups = useGroupsStore((s) => s.reorderGroups)
  const toggleGroupCollapsed = useGroupsStore((s) => s.toggleGroupCollapsed)
  const createFolder = useGroupsStore((s) => s.createFolder)
  const renameFolder = useGroupsStore((s) => s.renameFolder)
  const deleteFolder = useGroupsStore((s) => s.deleteFolder)
  const toggleFolderCollapsed = useGroupsStore((s) => s.toggleFolderCollapsed)
  const noteOrder = useGroupsStore((s) => s.noteOrder)
  const setContextNoteOrder = useGroupsStore((s) => s.setContextNoteOrder)

  const searchRef = useRef<HTMLInputElement>(null)

  // ── Note context menu ──────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    noteId: string
    sectionId: string | null
  } | null>(null)

  // ── Group context menu ─────────────────────────────────────────────────────
  const [groupContextMenu, setGroupContextMenu] = useState<{
    x: number
    y: number
    groupId: string
  } | null>(null)

  // ── Folder context menu ────────────────────────────────────────────────────
  const [folderContextMenu, setFolderContextMenu] = useState<{
    x: number
    y: number
    folderId: string
  } | null>(null)

  // ── Folder picker (move note to folder) ────────────────────────────────────
  const [folderPickerNoteId, setFolderPickerNoteId] = useState<string | null>(null)

  // ── Folder rename inline ───────────────────────────────────────────────────
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')

  // ── New folder inline input (per group; optional note to assign on create) ──
  const [newFolderInput, setNewFolderInput] = useState<{ groupId: string; noteId?: string } | null>(null)
  const [newFolderName, setNewFolderName] = useState('')

  // ── Group picker / create inline ───────────────────────────────────────────
  const [groupPickerNoteId, setGroupPickerNoteId] = useState<string | null>(null)
  const [groupPickerFlip, setGroupPickerFlip] = useState<{ x: boolean; y: boolean }>({ x: false, y: false })
  const [groupNameInput, setGroupNameInput] = useState<{ noteId: string; value: string } | null>(null)

  // ── Group rename inline ────────────────────────────────────────────────────
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')

  // ── New group inline input ─────────────────────────────────────────────────
  const [newGroupInput, setNewGroupInput] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // ── Group drag-to-reorder ──────────────────────────────────────────────────
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null)
  const [groupDropTarget, setGroupDropTarget] = useState<{ groupId: string; position: 'before' | 'after' } | null>(null)

  // ── Confirm modal ──────────────────────────────────────────────────────────
  const [modal, setModal] = useState<{
    title: string
    message: string
    confirmLabel: string
    danger: boolean
    onConfirm: () => void
  } | null>(null)

  // ── Encryption modal ───────────────────────────────────────────────────────
  const [encModal, setEncModal] = useState<{
    mode: 'encrypt' | 'unlock' | 'remove'
    noteId: string
  } | null>(null)

  // noteId to delete after a successful unlock (for delete-encrypted-note flow)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const [calendarExpanded, setCalendarExpanded] = useState(false)
  const [keyboardResultIndex, setKeyboardResultIndex] = useState(-1)
  const [newNoteCtx, setNewNoteCtx] = useState<{ x: number; y: number } | null>(null)

  // ── Note reorder via drag & drop ───────────────────────────────────────────
  const [noteDropTarget, setNoteDropTarget] = useState<{
    noteId: string
    position: 'before' | 'after'
    contextKey: string
  } | null>(null)
  const draggingNoteContextRef = useRef<string | null>(null)
  const draggingNoteIdRef = useRef<string | null>(null)

  // ── Close menus on click elsewhere ────────────────────────────────────────
  useEffect(() => {
    const close = () => {
      setContextMenu(null)
      setGroupContextMenu(null)
      setFolderContextMenu(null)
      setGroupPickerNoteId(null)
      setFolderPickerNoteId(null)
      setGroupNameInput(null)
      setNewNoteCtx(null)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  useEffect(() => {
    const handler = () => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('noteflow:focus-search', handler)
    return () => window.removeEventListener('noteflow:focus-search', handler)
  }, [])

  const { sectionFilter, textQuery: sectionTextQuery } = useMemo(
    () => parseSearchQuery(searchQuery),
    [searchQuery]
  )

  // Ids of archived groups — used to hide their notes (and headers) unless "Show archived"
  const archivedGroupIds = useMemo(
    () => new Set(groups.filter((g) => g.archived).map((g) => g.id)),
    [groups],
  )

  const baseNotes = useMemo(() => {
    return rawNotes
      .filter((n) => showArchived || (!n.archived && !(n.group && archivedGroupIds.has(n.group))))
      .filter((n) => !filterTag || n.tags.includes(filterTag))
      .filter((n) => {
        if (!searchQuery.trim()) return true

        if (sectionFilter) {
          const sf = normalize(sectionFilter)
          const matchingSections = n.sections.filter(s => normalize(s.name).includes(sf))
          if (matchingSections.length === 0) return false
          if (!sectionTextQuery) return true
          const tq = normalize(sectionTextQuery)
          return (
            normalize(n.title).includes(tq) ||
            matchingSections.some(s => normalize(s.content).includes(tq)) ||
            n.tags.some(t => normalize(t).includes(tq))
          )
        }

        const q = normalize(searchQuery)
        return (
          normalize(n.title).includes(q) ||
          n.sections.some((s) => normalize(s.content).includes(q) || normalize(s.name).includes(q)) ||
          n.tags.some((t) => normalize(t).includes(q))
        )
      })
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
  }, [rawNotes, showArchived, filterTag, searchQuery, sectionFilter, sectionTextQuery, archivedGroupIds])

  const notes = useMemo(() => {
    if (selectedDayKey) {
      return baseNotes.filter((note) => {
        const createdDay = toDayKeyFromIso(note.created)
        const updatedDay = toDayKeyFromIso(note.updated)
        return createdDay === selectedDayKey || updatedDay === selectedDayKey
      })
    }

    return baseNotes.filter((n) => {
      if (filterDate === 'all') return true
      const updated = new Date(n.updated)
      const now = new Date()
      if (filterDate === 'today') return isToday(updated)
      if (filterDate === 'week') {
        const weekAgo = new Date(now)
        weekAgo.setDate(now.getDate() - 7)
        return updated >= weekAgo
      }
      if (filterDate === 'month') {
        const monthAgo = new Date(now)
        monthAgo.setMonth(now.getMonth() - 1)
        return updated >= monthAgo
      }
      return true
    })
  }, [baseNotes, filterDate, selectedDayKey])

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth)
    const monthEnd = endOfMonth(calendarMonth)
    const rangeStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: rangeStart, end: rangeEnd })
  }, [calendarMonth])

  const dayMarkers = useMemo(() => {
    const markers = new Map<string, { created: number; updated: number }>()
    for (const note of baseNotes) {
      const createdKey = toDayKeyFromIso(note.created)
      if (createdKey) {
        const current = markers.get(createdKey) ?? { created: 0, updated: 0 }
        current.created += 1
        markers.set(createdKey, current)
      }

      const updatedKey = toDayKeyFromIso(note.updated)
      if (updatedKey) {
        const current = markers.get(updatedKey) ?? { created: 0, updated: 0 }
        current.updated += 1
        markers.set(updatedKey, current)
      }
    }
    return markers
  }, [baseNotes])

  const items = useSidebarGroups(notes, groups, folders, noteOrder)
  const visibleNoteIds = useMemo(() => {
    const ids: string[] = []
    for (const item of items) {
      if (item.kind === 'group') {
        ids.push(...item.notes.map((note) => note.id))
        for (const f of item.folders) ids.push(...f.notes.map((note) => note.id))
      } else {
        ids.push(item.note.id)
      }
    }
    return ids
  }, [items])
  const hasSearchFilter = searchQuery.trim().length > 0
  const hasDateFilter = filterDate !== 'all'
  const hasTagFilter = Boolean(filterTag)
  const hasDayFilter = Boolean(selectedDayKey)
  const hasArchivedFilter = showArchived
  const hasActiveFilters = hasSearchFilter || hasDateFilter || hasTagFilter || hasDayFilter || hasArchivedFilter
  const scopedTotal = rawNotes.filter((n) => showArchived || !n.archived).length

  // Section headers ("groups" / "notes") mirror the favorites label. Compute the
  // first group that will actually render and the first ungrouped note, so each
  // header is emitted exactly once, right before its block.
  const hasFavorites = notes.some((n) => n.favorited)
  const firstRenderableGroupId = (() => {
    for (const it of items) {
      if (it.kind !== 'group') continue
      if (hasActiveFilters && it.visibleCount === 0) continue
      if (it.group.archived && !showArchived) continue
      return it.group.id
    }
    return null
  })()
  const firstUngroupedNoteId = (() => {
    for (const it of items) {
      if (it.kind === 'note') return it.note.id
    }
    return null
  })()
  // Only label the ungrouped remainder ("notes") when something sits above it —
  // a flat list with no favorites and no groups needs no header.
  const showNotesHeader = firstUngroupedNoteId != null && (hasFavorites || firstRenderableGroupId != null)
  const activeSearchNoteId =
    hasSearchFilter && keyboardResultIndex >= 0 && keyboardResultIndex < visibleNoteIds.length
      ? visibleNoteIds[keyboardResultIndex]
      : null

  useEffect(() => {
    if (!hasSearchFilter || visibleNoteIds.length === 0) {
      setKeyboardResultIndex(-1)
      return
    }
    setKeyboardResultIndex((prev) => {
      if (prev >= 0 && prev < visibleNoteIds.length) return prev
      return 0
    })
  }, [hasSearchFilter, visibleNoteIds])

  useEffect(() => {
    if (!activeSearchNoteId) return
    const target = document.querySelector<HTMLElement>(`[data-note-id="${activeSearchNoteId}"]`)
    target?.scrollIntoView({ block: 'nearest' })
  }, [activeSearchNoteId])

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getNoteGroupDirect(noteId: string) {
    const note = rawNotes.find(n => n.id === noteId)
    return note?.group ? groups.find(g => g.id === note.group) ?? null : null
  }

  function closeAllMenus() {
    setContextMenu(null)
    setGroupContextMenu(null)
    setFolderContextMenu(null)
    setGroupPickerNoteId(null)
    setFolderPickerNoteId(null)
    setGroupNameInput(null)
  }

  async function createNoteInGroup(groupId: string) {
    const note = await createNote()
    await updateNote(note.id, { group: groupId })
    closeAllMenus()
  }

  async function createNoteInFolder(groupId: string, folderId: string) {
    const note = await createNote()
    await updateNote(note.id, { group: groupId, folder: folderId })
    closeAllMenus()
  }

  // Open the inline "new folder" input inside a group, expanding it if collapsed.
  function startNewFolder(groupId: string, noteId?: string) {
    if (collapsedGroupIds.has(groupId)) toggleGroupCollapsed(groupId)
    setNewFolderInput({ groupId, noteId })
    setNewFolderName('')
    closeAllMenus()
  }

  async function commitNewFolder() {
    if (!newFolderInput || !newFolderName.trim()) {
      setNewFolderInput(null)
      setNewFolderName('')
      return
    }
    const folder = await createFolder(newFolderInput.groupId, newFolderName.trim())
    if (newFolderInput.noteId) {
      await updateNote(newFolderInput.noteId, { group: newFolderInput.groupId, folder: folder.id })
    }
    setNewFolderInput(null)
    setNewFolderName('')
  }


  function moveSearchSelection(direction: 1 | -1) {
    if (visibleNoteIds.length === 0) return
    setKeyboardResultIndex((prev) => {
      if (prev < 0) return direction === 1 ? 0 : visibleNoteIds.length - 1
      const next = prev + direction
      if (next < 0) return visibleNoteIds.length - 1
      if (next >= visibleNoteIds.length) return 0
      return next
    })
  }

  function openSelectedSearchResult() {
    const targetId = activeSearchNoteId ?? visibleNoteIds[0]
    if (!targetId) return
    setOpenNoteIds([targetId])
    setActiveNote(targetId)
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
    if (visibleNoteIds.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveSearchSelection(1)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveSearchSelection(-1)
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      openSelectedSearchResult()
    }
  }

  function getNoteContextKey(note: (typeof rawNotes)[0], inFavorites?: boolean): string {
    if (inFavorites) return 'favorites'
    if (note.folder) return `folder:${note.folder}`
    if (note.group) return `group:${note.group}`
    return 'ungrouped'
  }

  function handleNoteDragStart(e: React.DragEvent<HTMLButtonElement>, noteId: string, contextKey: string) {
    e.dataTransfer.setData('application/x-noteflow-note-id', noteId)
    e.dataTransfer.setData('text/plain', noteId)
    e.dataTransfer.effectAllowed = 'copyMove'
    draggingNoteContextRef.current = contextKey
    draggingNoteIdRef.current = noteId
    window.dispatchEvent(new CustomEvent('noteflow:note-drag', {
      detail: { active: true, noteId },
    }))
  }

  function handleNoteDragEnd() {
    draggingNoteContextRef.current = null
    draggingNoteIdRef.current = null
    setNoteDropTarget(null)
    window.dispatchEvent(new CustomEvent('noteflow:note-drag', {
      detail: { active: false },
    }))
  }

  function handleNoteReorderDragOver(e: React.DragEvent<HTMLLIElement>, note: (typeof rawNotes)[0], contextKey: string) {
    if (!draggingNoteContextRef.current) return
    if (draggingNoteContextRef.current !== contextKey) return
    if (draggingNoteIdRef.current === note.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setNoteDropTarget((prev) =>
      prev?.noteId === note.id && prev.position === position ? prev : { noteId: note.id, position, contextKey }
    )
  }

  function handleNoteReorderDrop(e: React.DragEvent<HTMLLIElement>, targetNote: (typeof rawNotes)[0], contextKey: string) {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData('application/x-noteflow-note-id')
    if (!draggedId || draggedId === targetNote.id) { setNoteDropTarget(null); return }
    const position = noteDropTarget?.noteId === targetNote.id ? noteDropTarget.position : 'after'
    setNoteDropTarget(null)

    // Compute the ordered list for this context from the currently visible notes
    const contextNotes = items.flatMap((item) => {
      if (contextKey === 'ungrouped' && item.kind === 'note') return [item.note]
      if (contextKey.startsWith('favorites')) return []
      if (item.kind === 'group') {
        if (contextKey === `group:${item.group.id}`) return item.notes
        const folder = item.folders.find((f) => contextKey === `folder:${f.folder.id}`)
        if (folder) return folder.notes
      }
      return []
    })

    const currentIds = contextNotes.map((n) => n.id)
    const without = currentIds.filter((id) => id !== draggedId)
    let targetIndex = without.indexOf(targetNote.id)
    if (targetIndex === -1) { setNoteDropTarget(null); return }
    if (position === 'after') targetIndex += 1
    without.splice(targetIndex, 0, draggedId)
    void setContextNoteOrder(contextKey, without)
  }

  function handleFavoritesReorderDrop(e: React.DragEvent<HTMLLIElement>, targetNote: (typeof rawNotes)[0]) {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData('application/x-noteflow-note-id')
    if (!draggedId || draggedId === targetNote.id) { setNoteDropTarget(null); return }
    const position = noteDropTarget?.noteId === targetNote.id ? noteDropTarget.position : 'after'
    setNoteDropTarget(null)

    const favoriteNotes = notes.filter((n) => n.favorited)
    const currentIds = (noteOrder['favorites'] ?? favoriteNotes.map((n) => n.id))
      .filter((id) => favoriteNotes.some((n) => n.id === id))
    const without = currentIds.filter((id) => id !== draggedId)
    let targetIndex = without.indexOf(targetNote.id)
    if (targetIndex === -1) { setNoteDropTarget(null); return }
    if (position === 'after') targetIndex += 1
    without.splice(targetIndex, 0, draggedId)
    void setContextNoteOrder('favorites', without)
  }

  // ── Group reorder via drag & drop ──────────────────────────────────────────
  function handleGroupDragStart(e: React.DragEvent, groupId: string) {
    e.dataTransfer.setData('application/x-noteflow-group-id', groupId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingGroupId(groupId)
  }

  function handleGroupDragOver(e: React.DragEvent, groupId: string) {
    if (!draggingGroupId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (groupId === draggingGroupId) {
      setGroupDropTarget(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setGroupDropTarget((prev) =>
      prev?.groupId === groupId && prev.position === position ? prev : { groupId, position }
    )
  }

  function handleGroupDragEnd() {
    setDraggingGroupId(null)
    setGroupDropTarget(null)
  }

  function handleGroupDrop(e: React.DragEvent, targetId: string) {
    if (!draggingGroupId) return
    e.preventDefault()
    const dragged = draggingGroupId
    const position = groupDropTarget?.groupId === targetId ? groupDropTarget.position : 'before'
    handleGroupDragEnd()
    if (dragged === targetId) return

    const ordered = [...groups].sort((a, b) => a.order - b.order).map((g) => g.id)
    const without = ordered.filter((id) => id !== dragged)
    let targetIndex = without.indexOf(targetId)
    if (targetIndex === -1) return
    if (position === 'after') targetIndex += 1
    without.splice(targetIndex, 0, dragged)
    void reorderGroups(without)
  }

  function renderNoteButton(note: (typeof rawNotes)[0], group?: { id: string; color: string } | null, indent?: number, inFavorites?: boolean, wrapperClassName?: string) {
    const isActive = activeNoteId === note.id
    const isSearchTarget = activeSearchNoteId === note.id
    const contextKey = getNoteContextKey(note, inFavorites)
    const isDropBefore = noteDropTarget?.noteId === note.id && noteDropTarget.position === 'before'
    const isDropAfter = noteDropTarget?.noteId === note.id && noteDropTarget.position === 'after'
    return (
      <li
        key={inFavorites ? `fav-${note.id}` : note.id}
        style={{ position: 'relative' }}
        className={wrapperClassName}
        onDragOver={(e) => handleNoteReorderDragOver(e, note, contextKey)}
        onDragLeave={() => setNoteDropTarget((prev) => prev?.noteId === note.id ? null : prev)}
        onDrop={(e) => inFavorites ? handleFavoritesReorderDrop(e, note) : handleNoteReorderDrop(e, note, contextKey)}
      >
        {isDropBefore && (
          <div style={{ position: 'absolute', top: 0, left: 4, right: 4, height: 2, borderRadius: 2, background: 'rgb(var(--text) / 0.45)', zIndex: 5, pointerEvents: 'none' }} />
        )}
        {isDropAfter && (
          <div style={{ position: 'absolute', bottom: 0, left: 4, right: 4, height: 2, borderRadius: 2, background: 'rgb(var(--text) / 0.45)', zIndex: 5, pointerEvents: 'none' }} />
        )}
        <button
          data-note-id={note.id}
          draggable
          onDragStart={(e) => handleNoteDragStart(e, note.id, contextKey)}
          onDragEnd={handleNoteDragEnd}
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              openNoteInSplit(note.id)
              return
            }
            setOpenNoteIds([note.id])
            setActiveNote(note.id)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              noteId: note.id,
              sectionId: null,
            })
          }}
          className={`relative block w-full text-left px-2.5 py-1.5 rounded-md transition-colors
            ${!isActive ? 'hover:bg-surface-3' : ''}
            ${isSearchTarget ? 'ring-1 ring-inset ring-text/25' : ''}`}
          style={{
            ...(indent != null ? { paddingLeft: indent } : {}),
            ...(isActive
              ? { background: group ? `rgb(var(${group.color}) / 0.14)` : 'rgb(var(--text) / 0.1)' }
              : {}),
            ...(isSearchTarget && !isActive ? { background: 'rgb(var(--text) / 0.06)' } : {}),
          }}
          title="Ctrl/Cmd + click to open side by side"
        >
          <div className="flex items-center gap-1 min-w-0">
            {note.encryption && <Lock size={9} className="text-amber-400 flex-shrink-0" />}
            {note.expiresAt && <span title={formatExpiry(note.expiresAt)} className="flex-shrink-0 flex items-center"><Timer size={9} className="text-text-muted/60" /></span>}
            <span className={`text-[13px] font-mono font-medium truncate flex-1
              ${activeNoteId === note.id ? 'text-text' : 'text-text/80'}`}>
              {renderHighlightedText(note.title || 'Untitled', searchQuery)}
            </span>
            <span className="text-xs font-mono text-text-muted/50 flex-shrink-0 ml-1">
              {formatNoteDate(note.updated)}
            </span>
          </div>
          <SectionTabsRow
            noteId={note.id}
            sections={note.sections}
            searchQuery={searchQuery}
            sectionFilter={sectionFilter}
            sectionTagColors={sectionTagColors}
            onSectionClick={(sectionId, e) => {
              e.stopPropagation()
              // When the group overview or brain view is open the editor is unmounted, so a
              // synchronous request-section event is lost. Stash the target section (the editor
              // reads it on mount) and re-emit once it's listening (next macrotask) — same as
              // GroupOverview / BrainView.
              const { groupViewId, noteViewId, brainViewOpen } = useNotesStore.getState()
              const editorUnmounted = groupViewId !== null || noteViewId !== null || brainViewOpen
              if (editorUnmounted) {
                useNotesStore.setState({ pendingInitialSectionId: sectionId })
              }
              window.dispatchEvent(new CustomEvent('noteflow:request-section', {
                detail: { noteId: note.id, sectionId }
              }))
              if (e.ctrlKey || e.metaKey) {
                openNoteInSplit(note.id)
                return
              }
              setOpenNoteIds([note.id])
              setActiveNote(note.id)
              if (editorUnmounted) {
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('noteflow:request-section', {
                    detail: { noteId: note.id, sectionId },
                  }))
                }, 0)
              }
            }}
            onSectionContextMenu={(e, sectionId) => {
              e.preventDefault()
              e.stopPropagation()
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                noteId: note.id,
                sectionId,
              })
            }}
            renderHighlightedText={renderHighlightedText}
          />
        </button>
      </li>
    )
  }

  function renderFolder(group: { id: string; color: GroupColor }, sf: SidebarFolder) {
    const { folder, notes: folderNotes } = sf
    const collapsed = collapsedFolderIds.has(folder.id)
    if (hasActiveFilters && folderNotes.length === 0) return null
    return (
      <div key={`folder-${folder.id}`}>
        {editingFolderId === folder.id ? (
          <div className="flex items-center gap-1.5 pl-2.5 pr-2 py-1">
            <FolderOpen size={12} className="flex-shrink-0" fill={`rgb(var(${group.color}) / 0.22)`} style={{ color: `rgb(var(${group.color}))` }} />
            <input
              autoFocus
              value={editingFolderName}
              onChange={(e) => setEditingFolderName(e.target.value)}
              onBlur={() => {
                if (editingFolderName.trim()) renameFolder(folder.id, editingFolderName.trim())
                setEditingFolderId(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (editingFolderName.trim()) renameFolder(folder.id, editingFolderName.trim())
                  setEditingFolderId(null)
                }
                if (e.key === 'Escape') setEditingFolderId(null)
              }}
              className="flex-1 text-[11.5px] font-mono bg-surface-1 border border-text/25 rounded px-1 outline-none text-text"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : (
          <NoteFolderHeader
            folder={folder}
            groupColor={group.color}
            noteCount={folderNotes.length}
            collapsed={collapsed}
            onToggle={() => toggleFolderCollapsed(folder.id)}
            onContextMenu={(e) => {
              setFolderContextMenu({ x: e.clientX, y: e.clientY, folderId: folder.id })
            }}
          />
        )}

        {/* Animated collapsible body with a colored guide line */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: collapsed ? '0fr' : '1fr',
            transition: 'grid-template-rows 180ms ease',
          }}
        >
          <div style={{ overflow: 'hidden', position: 'relative' }}>
            <div style={{
              position: 'absolute',
              left: '14px', top: '3px', bottom: '5px',
              width: '1px',
              background: `rgb(var(${group.color}) / 0.22)`,
              pointerEvents: 'none',
              zIndex: 1,
            }} />
            <ul className="flex flex-col gap-0.5 mt-0.5">
              {folderNotes.map((note) => renderNoteButton(note, group, 26))}
              {folderNotes.length === 0 && (
                <li>
                  <button
                    onClick={() => createNoteInFolder(group.id, folder.id)}
                    className="w-full text-left pl-[26px] pr-2.5 py-2 text-xs font-mono text-text-muted hover:text-text flex items-center gap-1.5 transition-colors"
                  >
                    <Plus size={10} />
                    New note
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full border-r border-border bg-surface-1">
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
      {encModal && (() => {
        const encNote = rawNotes.find(n => n.id === encModal.noteId)
        if (!encNote) return null
        return (
          <EncryptionModal
            mode={encModal.mode}
            noteTitle={encNote.title}
            onConfirm={async (password, options) => {
              if (encModal.mode === 'encrypt') {
                await encryptNote(encModal.noteId, password, options)
              } else if (encModal.mode === 'unlock') {
                await unlockNote(encModal.noteId, password)
                if (pendingDeleteId === encModal.noteId) {
                  const target = rawNotes.find(n => n.id === pendingDeleteId)
                  setPendingDeleteId(null)
                  setEncModal(null)
                  if (target) {
                    setModal({
                      title: 'Delete note',
                      message: `"${target.title || 'Untitled'}" will be permanently deleted.`,
                      confirmLabel: 'Delete',
                      danger: true,
                      onConfirm: () => { setModal(null); deleteNote(target.id) },
                    })
                  }
                  return
                }
              } else {
                await removeNoteEncryption(encModal.noteId, password)
              }
              setEncModal(null)
            }}
            onCancel={() => { setPendingDeleteId(null); setEncModal(null) }}
          />
        )
      })()}

      {/* ── Search + collapse ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search... or #section"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full pl-7 pr-7 py-1.5 bg-surface-2 border border-border rounded text-xs
                       font-mono text-text placeholder-text-muted/40 outline-none
                       focus:border-text/30 transition-colors caret-text"
          />
          {hasSearchFilter && (
            <button
              onClick={() => setSearchQuery('')}
              title="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <button
          onClick={onCollapse}
          title="Collapse sidebar (Ctrl+')"
          className="flex-shrink-0 p-1.5 rounded text-text-muted/50 hover:text-text-muted
                     hover:bg-surface-2 transition-colors"
        >
          <PanelLeftClose size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* ── Date filter ────────────────────────────────────────────────────── */}
      <div>
        <div className="flex gap-1 px-3 py-2">
          {(['all', 'today', 'week', 'month'] as const).map((opt) => {
            const labels = { all: 'All', today: 'Today', week: 'Week', month: 'Month' }
            const active = !selectedDayKey && filterDate === opt
            return (
              <button
                key={opt}
                onClick={() => {
                  setFilterDate(opt)
                  setSelectedDayKey(null)
                }}
                className="flex-1 py-0.5 rounded text-xs font-mono transition-colors"
                style={active
                  ? { color: 'rgb(var(--text))', background: 'rgb(var(--text) / 0.12)', border: '1px solid rgb(var(--text) / 0.25)' }
                  : { color: 'rgb(var(--text-muted))', background: 'transparent', border: '1px solid rgb(var(--border))' }
                }
              >
                {labels[opt]}
              </button>
            )
          })}
        </div>

        <div className="px-3 pb-2 flex items-center gap-1">
          <button
            onClick={() => setCalendarExpanded((prev) => !prev)}
            className="flex-1 flex items-center justify-center py-0.5 rounded text-xs font-mono transition-colors"
            style={calendarExpanded || selectedDayKey
              ? { color: 'rgb(var(--text))', background: 'rgb(var(--text) / 0.12)', border: '1px solid rgb(var(--text) / 0.25)' }
              : { color: 'rgb(var(--text-muted))', background: 'transparent', border: '1px solid rgb(var(--border))' }
            }
            title={calendarExpanded ? 'Hide calendar' : 'Show calendar'}
          >
            <CalendarDays size={14} />
          </button>
          {selectedDayKey && (
            <button
              onClick={() => setSelectedDayKey(null)}
              className="p-0.5 rounded transition-colors"
              style={{ color: 'rgb(var(--text))' }}
              title="Clear day filter"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {selectedDayKey && !calendarExpanded && (
          <div className="px-3 pb-2">
            <span className="text-[10px] font-mono text-text">
              {format(dayKeyToDate(selectedDayKey), 'EEEE, MMM d')}
            </span>
          </div>
        )}

        <div
          className="overflow-hidden transition-all duration-200 ease-in-out"
          style={{ maxHeight: calendarExpanded ? '400px' : '0px', opacity: calendarExpanded ? 1 : 0 }}
        >
          <div className="px-3 pb-2">
            <div className="rounded border border-border bg-surface-2/30 p-2">
              <div className="flex items-center justify-between mb-1.5">
                <button
                  onClick={() => setCalendarMonth((prev) => startOfMonth(addMonths(prev, -1)))}
                  className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                  title="Previous month"
                >
                  <ChevronLeft size={12} />
                </button>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted uppercase tracking-wider">
                  <CalendarDays size={10} />
                  <span>{format(calendarMonth, 'MMMM yyyy')}</span>
                </div>
                <button
                  onClick={() => setCalendarMonth((prev) => startOfMonth(addMonths(prev, 1)))}
                  className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                  title="Next month"
                >
                  <ChevronRight size={12} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => (
                  <div key={label} className="text-[9px] font-mono text-text-muted/60 text-center">
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                  const dayKey = toDayKey(day)
                  const marker = dayMarkers.get(dayKey)
                  const isSelected = selectedDayKey === dayKey
                  const inMonth = isSameMonth(day, calendarMonth)
                  const today = isToday(day)
                  const hasActivity = Boolean(marker && (marker.created > 0 || marker.updated > 0))

                  return (
                    <button
                      key={dayKey}
                      onClick={() => {
                        setSelectedDayKey((prev) => (prev === dayKey ? null : dayKey))
                        setCalendarExpanded(false)
                      }}
                      title={hasActivity
                        ? `${format(day, 'PPP')} · created ${marker?.created ?? 0}, updated ${marker?.updated ?? 0}`
                        : format(day, 'PPP')
                      }
                      className="h-7 rounded text-[10px] font-mono transition-colors flex flex-col items-center justify-center"
                      style={isSelected
                        ? {
                            background: 'rgb(var(--text) / 0.12)',
                            border: '1px solid rgb(var(--text) / 0.25)',
                            color: 'rgb(var(--text))',
                          }
                        : {
                            background: inMonth ? 'transparent' : 'rgb(var(--surface-1) / 0.45)',
                            border: today ? '1px solid rgb(var(--text) / 0.2)' : '1px solid rgb(var(--border) / 0.4)',
                            color: inMonth ? 'rgb(var(--text-muted))' : 'rgb(var(--text-muted) / 0.45)',
                          }
                      }
                    >
                      <span>{format(day, 'd')}</span>
                      <span className="h-[3px] flex items-center gap-[2px] mt-[1px]">
                        {marker && marker.created > 0 && (
                          <span className="w-[4px] h-[4px] rounded-full bg-emerald-400" />
                        )}
                        {marker && marker.updated > 0 && (
                          <span className="w-[4px] h-[4px] rounded-full bg-text/50" />
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ── New note / new group buttons ────────────────────────────────────── */}
      <div className="px-3 pt-2 pb-2 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => createNote()}
            onContextMenu={(e) => { e.preventDefault(); setNewNoteCtx({ x: e.clientX, y: e.clientY }) }}
            title="New note (Ctrl+N) · Right-click for temporary note"
            className="flex-1 py-1.5 rounded text-xs font-mono transition-all
                       bg-surface-2 text-text border border-text/20
                       hover:bg-surface-3 hover:border-text/30"
          >
            + New note
          </button>
          <button
            onClick={() => { setNewGroupInput(true); setNewGroupName('') }}
            title="New group"
            className="flex-shrink-0 p-1.5 rounded text-text-muted/50 border border-border
                       hover:text-text-muted hover:bg-surface-2 hover:border-border transition-colors"
          >
            <FolderPlus size={14} strokeWidth={2.5} />
          </button>
        </div>
        {newGroupInput && (
          <input
            autoFocus
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && newGroupName.trim()) {
                await createGroup(newGroupName.trim(), '--accent')
                setNewGroupInput(false)
                setNewGroupName('')
              }
              if (e.key === 'Escape') {
                setNewGroupInput(false)
                setNewGroupName('')
              }
            }}
            onBlur={() => { setNewGroupInput(false); setNewGroupName('') }}
            placeholder="Group name…"
            className="w-full px-2 py-1 text-xs font-mono bg-surface-1 border border-text/25 rounded outline-none text-text placeholder-text-muted/40 caret-text"
          />
        )}
      </div>

      {/* ── Notes list ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto notes-list-scroll">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted gap-2">
            <span className="text-2xl opacity-20">∅</span>
            <span className="text-xs font-mono">{rawNotes.length > 0 ? 'No notes match current filters' : 'No notes'}</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5 px-2.5 pt-2 pb-8">
            {/* ── Favorites section ───────────────────────────────────────── */}
            {(() => {
              const allFavorites = notes.filter((n) => n.favorited)
              if (allFavorites.length === 0) return null
              const favOrder = noteOrder['favorites']
              const favoriteNotes = favOrder
                ? [...favOrder.map((id) => allFavorites.find((n) => n.id === id)).filter((n): n is typeof allFavorites[0] => n != null),
                   ...allFavorites.filter((n) => !favOrder.includes(n.id))]
                : allFavorites
              return (
                <>
                  <li className="px-1 pt-0.5 pb-0.5">
                    <span className="text-[10px] font-mono text-text-muted/50 uppercase tracking-widest">favorites</span>
                  </li>
                  {favoriteNotes.map((note) => {
                    const noteGroup = note.group ? groups.find((g) => g.id === note.group) ?? null : null
                    return renderNoteButton(note, noteGroup, undefined, true)
                  })}
                </>
              )
            })()}
            {items.map((item) => {
              if (item.kind === 'group') {
                const { group, notes: groupNotes, folders: groupFolders } = item
                const collapsed = collapsedGroupIds.has(group.id)
                if (hasActiveFilters && item.visibleCount === 0) return null
                // Archived groups are hidden unless "Show archived" is on (then shown dimmed)
                if (group.archived && !showArchived) return null
                const isFirstGroup = group.id === firstRenderableGroupId
                return (
                  <Fragment key={`group-${group.id}`}>
                    {isFirstGroup && (
                      <li className="px-1 pt-0.5 pb-0.5 first:mt-0 mt-5">
                        <span className="text-[10px] font-mono text-text-muted/50 uppercase tracking-widest">groups</span>
                      </li>
                    )}
                  <li className={`${isFirstGroup ? '' : 'first:mt-0 mt-1.5'} ${group.archived ? 'opacity-50' : ''}`}>
                    {/* Group header / rename input — draggable to reorder groups */}
                    <div
                      style={{ position: 'relative', opacity: draggingGroupId === group.id ? 0.4 : 1 }}
                      draggable={editingGroupId !== group.id}
                      onDragStart={(e) => handleGroupDragStart(e, group.id)}
                      onDragOver={(e) => handleGroupDragOver(e, group.id)}
                      onDrop={(e) => handleGroupDrop(e, group.id)}
                      onDragEnd={handleGroupDragEnd}
                    >
                      {/* Drop insertion indicator */}
                      {groupDropTarget?.groupId === group.id && (
                        <div style={{
                          position: 'absolute',
                          left: 0, right: 0,
                          [groupDropTarget.position === 'before' ? 'top' : 'bottom']: -5,
                          height: '2px',
                          borderRadius: '2px',
                          background: 'rgb(var(--text) / 0.5)',
                          zIndex: 5,
                          pointerEvents: 'none',
                        }} />
                      )}
                      {editingGroupId === group.id ? (
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: `rgb(var(${group.color}))` }}
                          />
                          <input
                            autoFocus
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            onBlur={() => {
                              if (editingGroupName.trim()) renameGroup(group.id, editingGroupName.trim())
                              setEditingGroupId(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (editingGroupName.trim()) renameGroup(group.id, editingGroupName.trim())
                                setEditingGroupId(null)
                              }
                              if (e.key === 'Escape') setEditingGroupId(null)
                            }}
                            className="flex-1 text-[11px] font-mono bg-surface-1 border border-text/25 rounded px-1 outline-none text-text"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      ) : (
                        <NoteGroupHeader
                          group={group}
                          noteCount={item.visibleCount}
                          collapsed={collapsed}
                          onToggle={() => toggleGroupCollapsed(group.id)}
                          onOpenGroupView={() => setGroupView(group.id)}
                          onContextMenu={(e) => {
                            setGroupContextMenu({ x: e.clientX, y: e.clientY, groupId: group.id })
                          }}
                        />
                      )}
                    </div>

                    {/* Animated container */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateRows: collapsed ? '0fr' : '1fr',
                        transition: 'grid-template-rows 180ms ease',
                      }}
                    >
                      {/* overflow:hidden reveals the notes top→bottom as the grid expands */}
                      <div style={{ overflow: 'hidden', position: 'relative' }}>
                        {/* Group guide line — sits one level left of the folder guides */}
                        <div style={{
                          position: 'absolute',
                          left: '1px', top: '3px', bottom: '5px',
                          width: '1px',
                          background: `rgb(var(${group.color}) / 0.5)`,
                          pointerEvents: 'none',
                          zIndex: 1,
                        }} />
                        {/* Inline "new folder" input */}
                        {newFolderInput?.groupId === group.id && (
                          <div className="flex items-center gap-1.5 pl-2.5 pr-2 py-1">
                            <Folder size={12} className="flex-shrink-0" fill={`rgb(var(${group.color}) / 0.16)`} style={{ color: `rgb(var(${group.color}))` }} />
                            <input
                              autoFocus
                              value={newFolderName}
                              onChange={(e) => setNewFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void commitNewFolder()
                                if (e.key === 'Escape') { setNewFolderInput(null); setNewFolderName('') }
                              }}
                              onBlur={() => void commitNewFolder()}
                              placeholder="Folder name…"
                              className="flex-1 text-[11.5px] font-mono bg-surface-1 border border-text/25 rounded px-1 outline-none text-text placeholder-text-muted/40"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        )}
                        <ul className="flex flex-col gap-0.5 mt-0.5">
                          {groupNotes.map((note) => renderNoteButton(note, group))}
                          {groupNotes.length === 0 && groupFolders.length === 0 && !newFolderInput && (
                            <li>
                              <button
                                onClick={() => createNoteInGroup(group.id)}
                                className="w-full text-left px-2.5 py-2 text-xs font-mono text-text-muted hover:text-text flex items-center gap-1.5 transition-colors"
                              >
                                <Plus size={10} />
                                New note
                              </button>
                            </li>
                          )}
                        </ul>
                        {/* Subfolders */}
                        {groupFolders.length > 0 && (
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            {groupFolders.map((sf) => renderFolder(group, sf))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                  </Fragment>
                )
              }

              // kind === 'note' (ungrouped)
              if (showNotesHeader && item.note.id === firstUngroupedNoteId) {
                return (
                  <Fragment key={`note-${item.note.id}`}>
                    <li className="px-1 pt-0.5 pb-0.5 first:mt-0 mt-5">
                      <span className="text-[10px] font-mono text-text-muted/50 uppercase tracking-widest">notes</span>
                    </li>
                    {renderNoteButton(item.note, null)}
                  </Fragment>
                )
              }
              return renderNoteButton(item.note, null)
            })}
          </ul>
        )}
      </div>

      {/* ── New note context menu ───────────────────────────────────────────── */}
      {newNoteCtx && (
        <ContextMenu
          x={newNoteCtx.x}
          y={newNoteCtx.y}
          className="fixed z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-52 animate-in fade-in zoom-in duration-100"
        >
          <button
            onClick={() => { createTempNote(); setNewNoteCtx(null) }}
            className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
          >
            <Timer size={12} />
            Temporary note (24h)
          </button>
        </ContextMenu>
      )}

      {/* ── Note Context Menu ────────────────────────────────────────────────── */}
      {contextMenu && (() => {
        const note = rawNotes.find(n => n.id === contextMenu.noteId)
        if (!note) return null
        const currentGroup = getNoteGroupDirect(note.id)
        const currentSection = contextMenu.sectionId
          ? note.sections.find((section) => section.id === contextMenu.sectionId) ?? null
          : null
        const currentSectionColor = currentSection
          ? sectionTagColors[normalizeTagColorKey(currentSection.name)]
          : undefined
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            className="fixed z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-48 animate-in fade-in zoom-in duration-100"
          >
            <button
              onClick={() => { updateNote(note.id, { favorited: !note.favorited }); closeAllMenus() }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              {note.favorited ? <StarOff size={12} /> : <Star size={12} />}
              {note.favorited ? 'Remove from favorites' : 'Add to favorites'}
            </button>
            <button
              onClick={() => { archiveNote(note.id); closeAllMenus() }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <Archive size={12} />
              {note.archived ? 'Unarchive' : 'Archive'}
            </button>
            {note.encryption && !sessionPasswords[note.id] && (
              <button
                onClick={() => { closeAllMenus(); setEncModal({ mode: 'unlock', noteId: note.id }) }}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
              >
                <Unlock size={12} />
                Unlock note
              </button>
            )}
            {note.encryption && !!sessionPasswords[note.id] && (
              <button
                onClick={() => { lockNote(note.id); closeAllMenus() }}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
              >
                <Lock size={12} />
                Lock note
              </button>
            )}
            {note.encryption && (
              <button
                onClick={() => { closeAllMenus(); setEncModal({ mode: 'remove', noteId: note.id }) }}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
              >
                <Unlock size={12} />
                Remove encryption
              </button>
            )}
            <button
              onClick={() => {
                openNoteInSplit(note.id)
                closeAllMenus()
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <Columns2 size={12} />
              Open alongside
            </button>
            <button
              onClick={() => { duplicateNote(note.id); closeAllMenus() }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <Copy size={12} />
              Duplicate note
            </button>
            <button
              onClick={() => { setNoteView(note.id); closeAllMenus() }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <LayoutGrid size={12} />
              Note overview
            </button>

            {currentSection && (
              <>
                <div className="h-px bg-border my-1" />
                <div className="px-3 pt-1 text-[10px] font-mono text-text-muted uppercase tracking-wider">
                  Section color
                </div>
                <div className="px-3 py-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {GROUP_COLORS.map((color) => (
                      <button
                        key={`section-color-${color}`}
                        title={color.replace('--', '')}
                        onClick={(e) => {
                          e.stopPropagation()
                          void setSectionTagColor(currentSection.name, color)
                          closeAllMenus()
                        }}
                        className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${currentSectionColor === color ? 'ring-1 ring-white/50 ring-offset-1 ring-offset-surface-2' : ''}`}
                        style={{ background: `rgb(var(${color}))` }}
                      />
                    ))}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void clearSectionTagColor(currentSection.name)
                        closeAllMenus()
                      }}
                      className={`px-1.5 h-4 rounded text-[9px] font-mono border transition-colors ${
                        currentSectionColor
                          ? 'text-text-muted border-border hover:text-text hover:border-text/30'
                          : 'text-text border-text/25 bg-surface-2'
                      }`}
                    >
                      Auto
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── Group section ── */}
            <div className="h-px bg-border my-1" />
            {currentGroup ? (
              <>
                {/* Move to folder submenu */}
                <div
                  className="relative"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const groupFolders = folders.filter((f) => f.groupId === currentGroup.id)
                    const submenuW = 160
                    const submenuH = (groupFolders.length + 2) * 34
                    setGroupPickerFlip({
                      x: rect.right + submenuW > window.innerWidth,
                      y: rect.top + submenuH > window.innerHeight,
                    })
                    setFolderPickerNoteId(note.id)
                  }}
                  onMouseLeave={() => setFolderPickerNoteId(null)}
                >
                  <button
                    className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
                  >
                    <Folder size={12} />
                    Move to folder
                    <ChevronRight size={10} className="ml-auto" />
                  </button>

                  {folderPickerNoteId === note.id && (() => {
                    const groupFolders = folders.filter((f) => f.groupId === currentGroup.id)
                    return (
                      <div
                        className="absolute z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-44 animate-in fade-in zoom-in duration-100"
                        style={{
                          [groupPickerFlip.x ? 'right' : 'left']: '100%',
                          [groupPickerFlip.y ? 'bottom' : 'top']: 0,
                        }}
                      >
                        {note.folder && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              updateNote(note.id, { folder: undefined })
                              closeAllMenus()
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-muted hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
                          >
                            <FolderMinus size={12} />
                            Group root
                          </button>
                        )}
                        {groupFolders.map((f) => (
                          <button
                            key={f.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              updateNote(note.id, { folder: f.id })
                              closeAllMenus()
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-2 transition-colors hover:bg-surface-3 hover:text-text ${note.folder === f.id ? 'text-text' : 'text-text-muted'}`}
                          >
                            <Folder size={12} className="flex-shrink-0" style={{ color: `rgb(var(${currentGroup.color}))` }} />
                            <span className="truncate">{f.name}</span>
                          </button>
                        ))}
                        {groupFolders.length === 0 && (
                          <div className="px-3 py-1.5 text-[10px] font-mono text-text-muted/60">No folders yet</div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            startNewFolder(currentGroup.id, note.id)
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-muted hover:bg-surface-3 hover:text-text transition-colors"
                        >
                          + New folder…
                        </button>
                      </div>
                    )
                  })()}
                </div>

                <button
                  onClick={() => { updateNote(note.id, { group: undefined, folder: undefined }); closeAllMenus() }}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
                >
                  <FolderMinus size={12} />
                  Remove from group
                </button>
              </>
            ) : (
              <>
                <div
                  className="relative"
                  onMouseEnter={(e) => {
                    if (groups.length === 0) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const submenuW = 160
                    const submenuH = (groups.length + 1) * 34
                    setGroupPickerFlip({
                      x: rect.right + submenuW > window.innerWidth,
                      y: rect.top + submenuH > window.innerHeight,
                    })
                    setGroupPickerNoteId(note.id)
                    setGroupNameInput(null)
                  }}
                  onMouseLeave={() => setGroupPickerNoteId(null)}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (groups.length === 0) setGroupNameInput({ noteId: note.id, value: '' })
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
                  >
                    <FolderPlus size={12} />
                    Add to group
                    {groups.length > 0 && <ChevronRight size={10} className="ml-auto" />}
                  </button>

                  {/* Group picker — submenu, repositioned to stay within window */}
                  {groupPickerNoteId === note.id && (
                    <div
                      className="absolute z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-40 animate-in fade-in zoom-in duration-100"
                      style={{
                        [groupPickerFlip.x ? 'right' : 'left']: '100%',
                        [groupPickerFlip.y ? 'bottom' : 'top']: 0,
                      }}
                    >
                      {groups.map((g) => (
                        <button
                          key={g.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            updateNote(note.id, { group: g.id })
                            closeAllMenus()
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: `rgb(var(${g.color}))` }}
                          />
                          {g.name}
                        </button>
                      ))}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setGroupPickerNoteId(null)
                          setGroupNameInput({ noteId: note.id, value: '' })
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs font-mono text-text-muted hover:bg-surface-3 hover:text-text transition-colors"
                      >
                        + New group…
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline group name input */}
                {groupNameInput?.noteId === note.id && (
                  <input
                    autoFocus
                    value={groupNameInput.value}
                    onChange={(e) => setGroupNameInput({ ...groupNameInput, value: e.target.value })}
                    onKeyDown={async (e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter' && groupNameInput.value.trim()) {
                        const g = await createGroup(groupNameInput.value.trim(), '--accent')
                        updateNote(note.id, { group: g.id })
                        closeAllMenus()
                      }
                      if (e.key === 'Escape') setGroupNameInput(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="mx-3 my-1 px-2 py-1 text-xs font-mono bg-surface-1 border border-text/25 rounded outline-none text-text w-[calc(100%-1.5rem)] block"
                    placeholder="Group name…"
                  />
                )}
              </>
            )}

            {(!note.encryption || !!sessionPasswords[note.id]) && (
              <>
                <div className="h-px bg-border my-1" />
                <button
                  onClick={() => {
                    const targetSectionId = contextMenu.sectionId ?? note.sections[0]?.id
                    if (targetSectionId) window.noteflow.openSticky(note.id, targetSectionId)
                    closeAllMenus()
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
                >
                  <ExternalLink size={12} />
                  Open as Sticky Note
                </button>
              </>
            )}
            <div className="h-px bg-border my-1" />
            <button
              onClick={() => {
                closeAllMenus()
                if (note.encryption && !sessionPasswords[note.id]) {
                  setPendingDeleteId(note.id)
                  setEncModal({ mode: 'unlock', noteId: note.id })
                  return
                }
                setModal({
                  title: 'Delete note',
                  message: `"${note.title || 'Untitled'}" will be permanently deleted.`,
                  confirmLabel: 'Delete',
                  danger: true,
                  onConfirm: () => { setModal(null); deleteNote(note.id) },
                })
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono font-normal text-red/75 hover:text-red hover:bg-red/10 flex items-center gap-2 transition-colors"
            >
              <Trash2 size={12} />
              Delete note
            </button>
          </ContextMenu>
        )
      })()}

      {/* ── Group Context Menu ───────────────────────────────────────────────── */}
      {groupContextMenu && (() => {
        const group = groups.find(g => g.id === groupContextMenu.groupId)
        if (!group) return null
        return (
          <ContextMenu
            x={groupContextMenu.x}
            y={groupContextMenu.y}
            className="fixed z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-44 overflow-hidden animate-in fade-in zoom-in duration-100"
          >
            <button
              onClick={(e) => { e.stopPropagation(); setGroupView(group.id); closeAllMenus() }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <LayoutGrid size={12} />
              View group
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => { e.stopPropagation(); createNoteInGroup(group.id) }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <Plus size={12} />
              New note
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); startNewFolder(group.id) }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <FolderPlus size={12} />
              New folder
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingGroupId(group.id)
                setEditingGroupName(group.name)
                setGroupContextMenu(null)
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              Rename group
            </button>

            {/* Color picker */}
            <div className="px-3 py-2">
              <div className="flex gap-1">
                {GROUP_COLORS.map((color) => (
                  <button
                    key={color}
                    title={color.replace('--', '')}
                    onClick={(e) => {
                      e.stopPropagation()
                      const updated = groups.map(g => g.id === group.id ? { ...g, color } : g)
                      window.noteflow.setGroups(updated)
                      useGroupsStore.setState({ groups: updated })
                      setGroupContextMenu(null)
                    }}
                    className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${group.color === color ? 'ring-1 ring-white/50 ring-offset-1 ring-offset-surface-2' : ''}`}
                    style={{ background: `rgb(var(${color}))` }}
                  />
                ))}
              </div>
            </div>

            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleGroupArchived(group.id)
                setGroupContextMenu(null)
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              {group.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
              {group.archived ? 'Unarchive group' : 'Archive group'}
            </button>

            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setGroupContextMenu(null)
                setModal({
                  title: 'Delete group',
                  message: `"${group.name}" will be deleted. Notes inside will become ungrouped.`,
                  confirmLabel: 'Delete',
                  danger: true,
                  onConfirm: async () => {
                    setModal(null)
                    // Clear group field from all notes in this group
                    const affectedNotes = rawNotes.filter(n => n.group === group.id)
                    for (const n of affectedNotes) {
                      await updateNote(n.id, { group: undefined })
                    }
                    deleteGroup(group.id)
                  },
                })
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-red-400 hover:bg-red-400/10 flex items-center gap-2 transition-colors"
            >
              <Trash2 size={12} />
              Delete group
            </button>
          </ContextMenu>
        )
      })()}

      {/* ── Folder Context Menu ──────────────────────────────────────────────── */}
      {folderContextMenu && (() => {
        const folder = folders.find(f => f.id === folderContextMenu.folderId)
        if (!folder) return null
        return (
          <ContextMenu
            x={folderContextMenu.x}
            y={folderContextMenu.y}
            className="fixed z-50 bg-surface-2 border border-border rounded shadow-xl py-1 w-44 overflow-hidden animate-in fade-in zoom-in duration-100"
          >
            <button
              onClick={(e) => { e.stopPropagation(); createNoteInFolder(folder.groupId, folder.id) }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              <Plus size={12} />
              New note
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingFolderId(folder.id)
                setEditingFolderName(folder.name)
                setFolderContextMenu(null)
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-text hover:bg-surface-3 hover:text-text flex items-center gap-2 transition-colors"
            >
              Rename folder
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFolderContextMenu(null)
                setModal({
                  title: 'Delete folder',
                  message: `"${folder.name}" will be deleted. Notes inside will move to the group root.`,
                  confirmLabel: 'Delete',
                  danger: true,
                  onConfirm: () => { setModal(null); deleteFolder(folder.id) },
                })
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-red-400 hover:bg-red-400/10 flex items-center gap-2 transition-colors"
            >
              <Trash2 size={12} />
              Delete folder
            </button>
          </ContextMenu>
        )
      })()}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-t border-border flex items-center justify-between">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`flex items-center gap-1 text-xs font-mono transition-colors
            ${showArchived ? 'text-text' : 'text-text-muted hover:text-text'}`}
        >
          <Archive size={10} />
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
        <span className="text-xs font-mono text-text-muted/40">
          {notes.length}{hasActiveFilters ? ` / ${scopedTotal}` : ''} notes
        </span>
      </div>
    </div>
  )
}
