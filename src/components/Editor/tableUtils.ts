import type { Editor } from '@tiptap/react'
import { findParentNode } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TableMap } from '@tiptap/pm/tables'

export type ColAlign = 'left' | 'center' | 'right' | null

const isCell = (n: PMNode) => {
  const role = (n.type.spec as { tableRole?: string }).tableRole
  return role === 'cell' || role === 'header_cell'
}

/** Alignment of the column the selection is currently in (reads the focused cell). */
export function getColumnAlign(editor: Editor): ColAlign {
  const cell = findParentNode(isCell)(editor.state.selection)
  return (cell?.node.attrs.textAlign as ColAlign) ?? null
}

/**
 * Set text-align on every cell of the column the selection is in. We write it to
 * all cells (not just the header) so it renders consistently; serialization only
 * reads the header cell, which keeps it portable to markdown's per-column `:---:`.
 */
export function setColumnAlign(editor: Editor, align: ColAlign): boolean {
  const { state } = editor
  const table = findParentNode((n) => n.type.name === 'table')(state.selection)
  const cell = findParentNode(isCell)(state.selection)
  if (!table || !cell) return false

  const map = TableMap.get(table.node)
  const col = map.colCount(cell.pos - table.start)

  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      for (let row = 0; row < map.height; row++) {
        const cellPos = table.start + map.map[row * map.width + col]
        const node = tr.doc.nodeAt(cellPos)
        if (node) tr.setNodeMarkup(cellPos, undefined, { ...node.attrs, textAlign: align })
      }
      return true
    })
    .run()
}
