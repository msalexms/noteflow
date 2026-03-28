import { useMemo } from 'react'
import type { Note, NoteGroup } from '../../types'

export type SidebarItem =
  | { kind: 'group-header'; group: NoteGroup; visibleCount: number }
  | { kind: 'note'; note: Note; inGroup: boolean }

export function useSidebarGroups(
  notes: Note[],
  groups: NoteGroup[],
  collapsedGroupIds: Set<string>
): SidebarItem[] {
  return useMemo(() => {
    const items: SidebarItem[] = []

    if (groups.length === 0) {
      for (const note of notes) {
        items.push({ kind: 'note', note, inGroup: false })
      }
      return items
    }

    // Build set of valid group IDs — guards against stale group refs in note.group
    const validGroupIds = new Set(groups.map((g) => g.id))

    // Map groupId → notes that pass filters and belong to that group
    const notesByGroup = new Map<string, Note[]>()
    const ungrouped: Note[] = []

    for (const note of notes) {
      if (note.group && validGroupIds.has(note.group)) {
        const arr = notesByGroup.get(note.group) ?? []
        arr.push(note)
        notesByGroup.set(note.group, arr)
      } else {
        ungrouped.push(note)
      }
    }

    // Emit groups sorted by order
    const sortedGroups = [...groups].sort((a, b) => a.order - b.order)
    for (const group of sortedGroups) {
      const groupNotes = notesByGroup.get(group.id) ?? []
      items.push({ kind: 'group-header', group, visibleCount: groupNotes.length })
      if (!collapsedGroupIds.has(group.id)) {
        for (const note of groupNotes) {
          items.push({ kind: 'note', note, inGroup: true })
        }
      }
    }

    // Ungrouped notes at the bottom
    for (const note of ungrouped) {
      items.push({ kind: 'note', note, inGroup: false })
    }

    return items
  }, [notes, groups, collapsedGroupIds])
}
