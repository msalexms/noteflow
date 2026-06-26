import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import type { SuggestionProps } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu'

export interface SlashCommandItem {
  title: string
  description?: string
  // Runs after the typed `/query` range has been deleted.
  run: (editor: Editor) => void
}

export interface SlashCommandsOptions {
  onLinkSection: (editor: Editor) => void
}

// Position the popup just below the caret, clamped to the viewport.
function positionPopup(popup: HTMLElement, rect: DOMRect | null) {
  if (!rect) return
  const margin = 8
  const width = popup.offsetWidth || 240
  let left = rect.left
  if (left + width + margin > window.innerWidth) left = window.innerWidth - width - margin
  if (left < margin) left = margin
  let top = rect.bottom + 6
  const height = popup.offsetHeight || 0
  if (top + height + margin > window.innerHeight) top = rect.top - height - 6
  popup.style.left = `${left}px`
  popup.style.top = `${Math.max(margin, top)}px`
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      onLinkSection: () => {},
    }
  },

  addProseMirrorPlugins() {
    const onLinkSection = this.options.onLinkSection
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        // Don't trigger inside code blocks.
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          return $from.parent.type.name !== 'codeBlock'
        },
        items: ({ query }) => {
          const all: SlashCommandItem[] = [
            {
              title: 'Link section',
              description: 'Link to another section',
              run: (editor) => onLinkSection(editor),
            },
          ]
          const q = query.trim().toLowerCase()
          return q ? all.filter((i) => i.title.toLowerCase().includes(q)) : all
        },
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run()
          props.run(editor)
        },
        render: () => {
          let component: ReactRenderer<SlashCommandMenuHandle> | null = null
          let popup: HTMLDivElement | null = null

          return {
            onStart: (props: SuggestionProps<SlashCommandItem>) => {
              component = new ReactRenderer(SlashCommandMenu, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              })
              popup = document.createElement('div')
              popup.style.position = 'fixed'
              popup.style.zIndex = '9999'
              popup.appendChild(component.element)
              document.body.appendChild(popup)
              positionPopup(popup, props.clientRect?.() ?? null)
            },
            onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
              component?.updateProps({ items: props.items, command: props.command })
              if (popup) positionPopup(popup, props.clientRect?.() ?? null)
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === 'Escape') {
                popup?.remove()
                return true
              }
              return component?.ref?.onKeyDown(props.event) ?? false
            },
            onExit: () => {
              popup?.remove()
              popup = null
              component?.destroy()
              component = null
            },
          }
        },
      }),
    ]
  },
})
