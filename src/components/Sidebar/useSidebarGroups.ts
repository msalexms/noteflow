import { useMemo } from 'react'
import type { Note, NoteGroup, NoteFolder } from '../../types'

export interface SidebarFolder {
  folder: NoteFolder
  notes: Note[]
}

export type SidebarItem =
  | {
      kind: 'group'
      group: NoteGroup
      notes: Note[]            // loose notes at the group root (no folder)
      folders: SidebarFolder[] // subfolders with their notes
      visibleCount: number     // loose + all folder notes
    }
  | { kind: 'note'; note: Note }  // ungrouped

function applyOrder(notes: Note[], orderedIds: string[] | undefined): Note[] {
  if (!orderedIds || orderedIds.length === 0) return notes
  const idSet = new Set(orderedIds)
  const ordered = orderedIds.map((id) => notes.find((n) => n.id === id)).filter((n): n is Note => n != null)
  const unordered = notes.filter((n) => !idSet.has(n.id))
  return [...ordered, ...unordered]
}

export function useSidebarGroups(
  notes: Note[],
  groups: NoteGroup[],
  folders: NoteFolder[] = [],
  noteOrder: Record<string, string[]> = {},
): SidebarItem[] {
  return useMemo(() => {
    const items: SidebarItem[] = []

    if (groups.length === 0) {
      const ordered = applyOrder(notes, noteOrder['ungrouped'])
      for (const note of ordered) {
        items.push({ kind: 'note', note })
      }
      return items
    }

    // Build sets/maps of valid refs — guards against stale ids on notes
    const validGroupIds = new Set(groups.map((g) => g.id))
    const folderById = new Map(folders.map((f) => [f.id, f]))

    // Map groupId → loose notes; folderId → notes
    const looseByGroup = new Map<string, Note[]>()
    const notesByFolder = new Map<string, Note[]>()
    const ungrouped: Note[] = []

    for (const note of notes) {
      if (!note.group || !validGroupIds.has(note.group)) {
        ungrouped.push(note)
        continue
      }
      // Note belongs to a valid group. Does it sit in a valid folder of that group?
      const folder = note.folder ? folderById.get(note.folder) : undefined
      if (folder && folder.groupId === note.group) {
        const arr = notesByFolder.get(folder.id) ?? []
        arr.push(note)
        notesByFolder.set(folder.id, arr)
      } else {
        const arr = looseByGroup.get(note.group) ?? []
        arr.push(note)
        looseByGroup.set(note.group, arr)
      }
    }

    // Emit groups sorted by order; archived groups sink to the bottom
    const sortedGroups = [...groups].sort(
      (a, b) => (Number(!!a.archived) - Number(!!b.archived)) || (a.order - b.order),
    )
    for (const group of sortedGroups) {
      const looseNotes = applyOrder(looseByGroup.get(group.id) ?? [], noteOrder[`group:${group.id}`])
      const groupFolders = folders
        .filter((f) => f.groupId === group.id)
        .sort((a, b) => a.order - b.order)
        .map((folder) => ({
          folder,
          notes: applyOrder(notesByFolder.get(folder.id) ?? [], noteOrder[`folder:${folder.id}`]),
        }))

      const folderNoteCount = groupFolders.reduce((sum, f) => sum + f.notes.length, 0)
      items.push({
        kind: 'group',
        group,
        notes: looseNotes,
        folders: groupFolders,
        visibleCount: looseNotes.length + folderNoteCount,
      })
    }

    // Ungrouped notes at the bottom
    const orderedUngrouped = applyOrder(ungrouped, noteOrder['ungrouped'])
    for (const note of orderedUngrouped) {
      items.push({ kind: 'note', note })
    }

    return items
  }, [notes, groups, folders, noteOrder])
}
