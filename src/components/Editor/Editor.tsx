import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Underline from '@tiptap/extension-underline'
import Strike from '@tiptap/extension-strike'
import Code from '@tiptap/extension-code'
import { CodeBlockWithCopy } from './CodeBlockWithCopy'
import Heading from '@tiptap/extension-heading'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import TaskList from '@tiptap/extension-task-list'
import { DeadlineTaskItem } from './DeadlineTaskItem'
import Link from '@tiptap/extension-link'
import { ResizableImage } from './ResizableImage'
import HardBreak from '@tiptap/extension-hard-break'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import History from '@tiptap/extension-history'
import Placeholder from '@tiptap/extension-placeholder'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'

// Per-cell text alignment, serialized to/from `style="text-align:…"`. This is the
// exact attribute htmlToMarkdown reads from header cells to emit markdown's
// per-column `:---:` separators, so column alignment round-trips through .md.
const textAlignAttribute = {
  textAlign: {
    default: null as 'left' | 'center' | 'right' | null,
    parseHTML: (el: HTMLElement) =>
      (el.style.textAlign as 'left' | 'center' | 'right') || null,
    renderHTML: (attrs: { textAlign?: string | null }) =>
      attrs.textAlign ? { style: `text-align:${attrs.textAlign}` } : {},
  },
}
const AlignedTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...textAlignAttribute }
  },
})
const AlignedTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...textAlignAttribute }
  },
})
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { common, createLowlight } from 'lowlight'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorToolbar } from './EditorToolbar'
import { TableContextMenu } from './TableContextMenu'
import { SearchHighlight } from './SearchHighlightExtension'
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { htmlFromMarkdown, htmlToMarkdown, containsMarkdownTable } from '../../lib/markdownHtml'

const lowlight = createLowlight(common)

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface EditorProps {
  content: string
  onChange: (markdown: string) => void
  placeholder?: string
  readOnly?: boolean
  hideToolbar?: boolean
  fontSize?: number
}

export interface EditorHandle {
  editor: TiptapEditor | null
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({
  content,
  onChange,
  placeholder = 'Start typing...',
  readOnly = false,
  hideToolbar = false,
  fontSize,
}, ref) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { fontFamily } = useEditorSettingsStore()

  const editor = useEditor({
    editorProps: {
      attributes: {
        spellcheck: 'false',
      },
      // Pasting raw markdown that contains a pipe table renders it as a real
      // table (matching other markdown editors). ProseMirror's default would
      // drop it in as literal `| … |` text. We only intercept when the pasted
      // plain text actually holds a markdown table — copying a rendered table
      // from the web carries text/html (tab-separated text/plain, no `|---|`),
      // which falls through to ProseMirror's native, richer handling.
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain') ?? ''
        if (!containsMarkdownTable(text)) return false
        event.preventDefault()
        const dom = new window.DOMParser().parseFromString(htmlFromMarkdown(text), 'text/html')
        const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(dom.body)
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
        return true
      },
    },
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Underline,
      Strike,
      Code,
      CodeBlockWithCopy.configure({ lowlight }),
      Heading.configure({ levels: [1, 2, 3] }),
      BulletList,
      OrderedList,
      ListItem,
      TaskList,
      DeadlineTaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: false }),
      ResizableImage.configure({ inline: true, allowBase64: true }),
      HorizontalRule,
      // resizable:false — column widths can't be stored in portable markdown, so
      // tables fill the available width with evenly distributed columns instead of
      // offering a resize affordance that silently resets on reload.
      Table.configure({ resizable: false, HTMLAttributes: { class: 'md-table' } }),
      TableRow,
      AlignedTableHeader,
      AlignedTableCell,
      HardBreak,
      History,
      Placeholder.configure({ placeholder }),
      SearchHighlight,
    ],
    content: htmlFromMarkdown(content),
    editable: !readOnly,
    autofocus: true,
    onUpdate({ editor }) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onChange(htmlToMarkdown(editor.getHTML()))
      }, 400)
    },
  })

  useImperativeHandle(ref, () => ({ editor }), [editor])

  // Open links in external browser on click
  useEffect(() => {
    if (!editor) return
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a')
      if (!target) return
      e.preventDefault()
      const href = target.getAttribute('href')
      if (href) window.noteflow.openUrl(href)
    }
    editor.view.dom.addEventListener('click', handler)
    return () => editor.view.dom.removeEventListener('click', handler)
  }, [editor])

  // Sync external content changes (e.g. sync from another window).
  // IMPORTANT: never reset content while the editor is focused — the debounced
  // save creates a window where the store lags behind the editor state, causing
  // a false mismatch that would call setContent mid-typing and jump the cursor.
  useEffect(() => {
    if (!editor) return
    if (editor.isFocused) return
    const currentMd = htmlToMarkdown(editor.getHTML()).trim()
    const incomingMd = content.trim()
    if (currentMd !== incomingMd) {
      editor.commands.setContent(htmlFromMarkdown(content), false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  const insertImageFiles = useCallback(async (files: File[]) => {
    if (!editor) return
    for (const file of files.filter(f => f.type.startsWith('image/'))) {
      const src = await fileToBase64(file)
      editor.chain().focus().setImage({ src, alt: file.name }).run()
    }
  }, [editor])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editor) return
      // Ctrl/Cmd+Shift+B → code block
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault()
        editor.chain().focus().toggleCodeBlock().run()
        return
      }

      // Intercept Enter to ensure we don't get trapped after a horizontal rule
      // or lose focus in weird edge cases.
      if (e.key === 'Enter' && !e.shiftKey) {
        const { state } = editor
        const { selection } = state
        const { $from } = selection

        // Check if we are right after a horizontal rule
        const nodeBefore = $from.nodeBefore
        if (nodeBefore && nodeBefore.type.name === 'horizontalRule') {
          // If we are, explicitly insert a paragraph to prevent getting trapped
          e.preventDefault()
          editor.chain().insertContent('<p></p>').focus().run()
          return
        }
      }
    },
    [editor]
  )

  if (!editor) return null

  return (
    <div
      className="flex flex-col h-full"
      onKeyDown={handleKeyDown}
      onPaste={(e: React.ClipboardEvent) => {
        const imageItems = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'))
        if (imageItems.length === 0) return
        e.preventDefault()
        insertImageFiles(imageItems.map(i => i.getAsFile()).filter(Boolean) as File[])
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e: React.DragEvent) => {
        const files = Array.from(e.dataTransfer.files)
        if (!files.some(f => f.type.startsWith('image/'))) return
        e.preventDefault()
        e.stopPropagation()
        insertImageFiles(files)
      }}
    >
      {!readOnly && !hideToolbar && <EditorToolbar editor={editor} />}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          '--prose-font-size': fontSize ? `${fontSize}px` : undefined,
          '--prose-font-family': fontFamily === 'inter'
            ? "'Inter', sans-serif"
            : "'JetBrains Mono', 'Fira Code', monospace",
        } as React.CSSProperties}
      >
        <EditorContent
          editor={editor}
          className="h-full prose-editor"
        />
      </div>
      {!readOnly && <TableContextMenu editor={editor} />}
    </div>
  )
})
