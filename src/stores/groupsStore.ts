import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { NoteGroup, GroupColor } from '../types'

interface GroupsState {
  groups: NoteGroup[]
  collapsedGroupIds: Set<string>

  loadGroups: () => Promise<void>
  createGroup: (name: string, color: GroupColor) => Promise<NoteGroup>
  renameGroup: (id: string, name: string) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
  toggleGroupCollapsed: (id: string) => void
}

export const useGroupsStore = create<GroupsState>((set, get) => ({
  groups: [],
  collapsedGroupIds: new Set(),

  loadGroups: async () => {
    const raw = await window.noteflow.getGroups()
    set({ groups: raw as NoteGroup[] })
  },

  createGroup: async (name, color) => {
    const { groups } = get()
    const maxOrder = groups.length > 0 ? Math.max(...groups.map((g) => g.order)) : -1
    const newGroup: NoteGroup = {
      id: nanoid(8),
      name,
      color,
      order: maxOrder + 1,
    }
    const updated = [...groups, newGroup]
    set({ groups: updated })
    await window.noteflow.setGroups(updated)
    return newGroup
  },

  renameGroup: async (id, name) => {
    const updated = get().groups.map((g) => (g.id === id ? { ...g, name } : g))
    set({ groups: updated })
    await window.noteflow.setGroups(updated)
  },

  deleteGroup: async (id) => {
    const updated = get().groups.filter((g) => g.id !== id)
    set({ groups: updated })
    await window.noteflow.setGroups(updated)
  },

  toggleGroupCollapsed: (id) => {
    set((s) => {
      const next = new Set(s.collapsedGroupIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { collapsedGroupIds: next }
    })
  },
}))
