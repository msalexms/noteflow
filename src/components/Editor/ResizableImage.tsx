import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import Image from '@tiptap/extension-image'
import { useState, useRef, useCallback } from 'react'

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const [resizing, setResizing] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const width: number | null = node.attrs.width ?? null

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const img = imgRef.current
      if (!img) return

      setResizing(true)
      startX.current = e.clientX
      startWidth.current = img.offsetWidth

      const onMouseMove = (e: MouseEvent) => {
        const newWidth = Math.max(50, startWidth.current + e.clientX - startX.current)
        updateAttributes({ width: Math.round(newWidth) })
      }

      const onMouseUp = () => {
        setResizing(false)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [updateAttributes],
  )

  return (
    <NodeViewWrapper
      as="span"
      className="group"
      style={{
        display: 'inline-block',
        position: 'relative',
        lineHeight: 0,
        verticalAlign: 'bottom',
        margin: '0.25rem 0',
        outline: selected ? '2px solid rgb(var(--accent))' : 'none',
        outlineOffset: '2px',
        borderRadius: '4px',
        cursor: resizing ? 'nwse-resize' : undefined,
        userSelect: 'none',
      }}
    >
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt ?? ''}
        draggable={false}
        style={{
          display: 'block',
          width: width != null ? `${width}px` : undefined,
          maxWidth: '100%',
          height: 'auto',
          borderRadius: '4px',
          margin: 0,
        }}
      />
      {/* Resize handle */}
      <span
        contentEditable="false"
        onMouseDown={onHandleMouseDown}
        className="resize-handle group-hover:opacity-100"
      />
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width')
          return w ? parseInt(w, 10) : null
        },
        renderHTML: (attrs) => (attrs.width != null ? { width: attrs.width } : {}),
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView, { as: 'span' })
  },
})
