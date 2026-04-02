import TaskItem from '@tiptap/extension-task-item'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { DeadlineTaskItemView } from './DeadlineTaskItemView'

export const DeadlineTaskItem = TaskItem.extend({
  // Must keep the same name so TaskList can resolve this node type
  name: 'taskItem',

  addOptions() {
    return {
      ...this.parent?.(),
      nested: false,
    }
  },

  addAttributes() {
    return {
      // Inherit the 'checked' attribute from TaskItem
      ...this.parent?.(),
      due: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-due') || null,
        renderHTML: (attrs) => (attrs.due ? { 'data-due': attrs.due } : {}),
      },
      alarm: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-alarm') || null,
        renderHTML: (attrs) => (attrs.alarm ? { 'data-alarm': attrs.alarm } : {}),
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(DeadlineTaskItemView)
  },
})
