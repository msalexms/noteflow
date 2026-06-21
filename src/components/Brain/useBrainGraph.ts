import { useMemo } from 'react'
import type { GroupColor, Note } from '../../types'
import { useNotesStore } from '../../stores/notesStore'
import { useGroupsStore } from '../../stores/groupsStore'
import { useAiStore } from '../../stores/aiStore'
import { useSidebarGroups } from '../Sidebar/useSidebarGroups'

// Two-layer brain graph model. Node ids are prefixed so groups, folders, notes and sections never
// collide: `g:<groupId>`, `f:<folderId>`, `n:<noteId>`, `s:<sectionId>`.
export type BrainNodeKind = 'group' | 'folder' | 'note' | 'section'

export interface BrainNode {
  id: string
  kind: BrainNodeKind
  label: string
  colorVar: GroupColor   // group color; folders/notes inherit their group's (ungrouped → --text)
  refId: string          // raw group/folder/note/section id
  noteId?: string        // note + section nodes (section's parent note)
  sectionId?: string     // note: first section (click target); section: its own id
  favorited?: boolean     // note + section nodes — drives the cerebellum mapping
}

export interface BrainStructureEdge { source: string; target: string }
export interface BrainContentEdge { source: string; target: string; score: number }

export interface BrainGraphModel {
  nodes: BrainNode[]
  structureEdges: BrainStructureEdge[]
  contentEdges: BrainContentEdge[]
}

/**
 * Builds the brain graph from the live note/group state (structure layer) and the AI index's
 * note-to-note similarities (content layer). Excludes archived, encrypted (no plaintext in the
 * index) and temporary notes; archived and empty groups/folders are dropped too.
 */
export function useBrainGraph(): BrainGraphModel {
  const notes = useNotesStore((s) => s.notes)
  const groups = useGroupsStore((s) => s.groups)
  const folders = useGroupsStore((s) => s.folders)
  const noteOrder = useGroupsStore((s) => s.noteOrder)
  const graphEdges = useAiStore((s) => s.graphEdges)

  const visibleNotes = useMemo(
    () => notes.filter((n) => !n.archived && !n.encryption && !n.expiresAt),
    [notes],
  )

  const items = useSidebarGroups(visibleNotes, groups, folders, noteOrder)

  return useMemo(() => {
    const nodes: BrainNode[] = []
    const structureEdges: BrainStructureEdge[] = []
    const noteNodeIds = new Set<string>()

    const addNote = (note: Note, colorVar: GroupColor): string => {
      const id = `n:${note.id}`
      nodes.push({
        id, kind: 'note',
        label: note.title?.trim() || 'Untitled',
        colorVar, refId: note.id, noteId: note.id,
        sectionId: note.sections[0]?.id,
        favorited: note.favorited,
      })
      noteNodeIds.add(note.id)
      // A single-section note collapses to just the soma: one node that already carries that
      // section as its click target (preview + navigation), so we skip the redundant dendrite.
      // With two or more sections, every section becomes a dendrite hanging off the soma —
      // including the first one, which the soma also keeps as its own click target.
      if (note.sections.length < 2) return id
      for (let i = 0; i < note.sections.length; i++) {
        const sec = note.sections[i]
        const sid = `s:${sec.id}`
        nodes.push({
          id: sid, kind: 'section',
          label: sec.name?.trim() || 'Section',
          colorVar, refId: sec.id, noteId: note.id,
          sectionId: sec.id, favorited: note.favorited,
        })
        structureEdges.push({ source: id, target: sid })
      }
      return id
    }

    for (const item of items) {
      if (item.kind === 'note') {
        addNote(item.note, '--text') // ungrouped → neutral, no structure edge
        continue
      }
      if (item.group.archived || item.visibleCount === 0) continue

      const gColor = item.group.color
      const gId = `g:${item.group.id}`
      nodes.push({ id: gId, kind: 'group', label: item.group.name, colorVar: gColor, refId: item.group.id })

      for (const note of item.notes) {
        structureEdges.push({ source: gId, target: addNote(note, gColor) })
      }
      for (const sf of item.folders) {
        if (sf.notes.length === 0) continue
        const fId = `f:${sf.folder.id}`
        nodes.push({ id: fId, kind: 'folder', label: sf.folder.name, colorVar: gColor, refId: sf.folder.id })
        structureEdges.push({ source: gId, target: fId })
        for (const note of sf.notes) {
          structureEdges.push({ source: fId, target: addNote(note, gColor) })
        }
      }
    }

    // The AI index emits relations generously (cosine > 0.05, up to 6 per note). Across a full
    // vault that's enough edges to drape the whole wireframe in a uniform whitish wash. Thin them
    // down to just the meaningful links: drop anything below MIN_SCORE, then keep only each note's
    // strongest MAX_PER_NOTE relations (strongest-first, and an edge survives as long as either
    // endpoint still has room — so no note is left fully unconnected). Raise/lower these two to
    // trade a denser web for a cleaner brain.
    const MIN_SCORE = 0.12
    const MAX_PER_NOTE = 5
    const candidates = graphEdges
      .filter((e) => e.score >= MIN_SCORE && noteNodeIds.has(e.a) && noteNodeIds.has(e.b))
      .sort((x, y) => y.score - x.score)
    const perNote = new Map<string, number>()
    const contentEdges: BrainContentEdge[] = []
    for (const e of candidates) {
      const ca = perNote.get(e.a) ?? 0, cb = perNote.get(e.b) ?? 0
      if (ca >= MAX_PER_NOTE && cb >= MAX_PER_NOTE) continue // both endpoints already saturated
      perNote.set(e.a, ca + 1); perNote.set(e.b, cb + 1)
      contentEdges.push({ source: `n:${e.a}`, target: `n:${e.b}`, score: e.score })
    }

    return { nodes, structureEdges, contentEdges }
  }, [items, graphEdges])
}
