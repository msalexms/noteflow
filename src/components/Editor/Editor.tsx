import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor as TiptapEditor } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Underline from '@tiptap/extension-underline'
import Strike from '@tiptap/extension-strike'
import Highlight from '@tiptap/extension-highlight'
import Code from '@tiptap/extension-code'
import { CodeBlockWithCopy } from './CodeBlockWithCopy'
import Heading from '@tiptap/extension-heading'
import Blockquote from '@tiptap/extension-blockquote'
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
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { EditorToolbar } from './EditorToolbar'
import { TableContextMenu } from './TableContextMenu'
import { SearchHighlight } from './SearchHighlightExtension'
import { SectionRelation } from './SectionRelation'
import { SlashCommands } from './SlashCommands'
import { SectionLinkPicker } from './SectionLinkPicker'
import { useEditorSettingsStore } from '../../stores/editorSettingsStore'
import { htmlFromMarkdown, htmlToMarkdown, looksLikeMarkdown } from '../../lib/markdownHtml'

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
  /** Whether to grab focus on mount. Disabled while a section rename is in progress
   *  so the editor doesn't steal focus from the tab-name input. */
  autoFocus?: boolean
  /** Id of the section being edited — excluded from the "Link section" picker. */
  currentSectionId?: string | null
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
  autoFocus = true,
  currentSectionId,
}, ref) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { fontFamily } = useEditorSettingsStore()
  // When the "/ → Link section" command runs, open the section picker.
  const [linkPickerOpen, setLinkPickerOpen] = useState(false)

  const editor = useEditor({
    editorProps: {
      attributes: {
        spellcheck: 'false',
      },
      // Pasting raw markdown source (from VS Code, a terminal, another markdown
      // editor…) renders it as real formatting — lists, tables, task lists,
      // headings — instead of literal text. ProseMirror's default would drop it
      // in verbatim (lists as dashes, tables as `| … |`) or, worse, parse the
      // syntax-highlighting HTML those editors ship into a mess of empty
      // paragraphs (the stray blank line after a heading).
      //
      // We bail to the native handler when the clipboard carries genuinely rich
      // HTML (Word, Google Docs, a rendered web page): it has semantic tags a
      // markdown re-parse of the degraded plain text would lose. Editors that
      // copy markdown source only ship styled <span>/<div> markup — none of
      // these tags — so they fall through to our converter.
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain') ?? ''
        if (!text.trim()) return false
        const html = event.clipboardData?.getData('text/html') ?? ''
        const richHtml = /<(a|strong|em|b|i|table|img|h[1-6]|blockquote)[\s>]/i.test(html)
        if (richHtml || !looksLikeMarkdown(text)) return false
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
      // `==text==` input rule → <mark>. multicolor off: a single accent-coloured
      // highlight (styled via CSS, no background) — see index.css `.ProseMirror mark`.
      Highlight,
      Code,
      CodeBlockWithCopy.configure({ lowlight }),
      Heading.configure({ levels: [1, 2, 3] }),
      // `> ` input rule → blockquote (VSCode/markdown-style citation). Round-trips
      // to markdown via markdownHtml.ts; styled in index.css `.ProseMirror blockquote`.
      Blockquote,
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
      SectionRelation,
      SlashCommands.configure({ onLinkSection: () => setLinkPickerOpen(true) }),
    ],
    content: htmlFromMarkdown(content),
    editable: !readOnly,
    autofocus: autoFocus,
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
      {linkPickerOpen && (
        <SectionLinkPicker
          editor={editor}
          currentSectionId={currentSectionId}
          onClose={() => setLinkPickerOpen(false)}
        />
      )}
    </div>
  )
})
