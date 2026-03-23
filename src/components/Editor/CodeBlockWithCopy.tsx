import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from '@tiptap/react'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { useState } from 'react'

interface CodeBlockViewProps {
  node: {
    textContent: string
    attrs: { language: string | null }
  }
}

function CodeBlockView({ node }: CodeBlockViewProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(node.textContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const language = node.attrs.language

  return (
    <NodeViewWrapper className="group">
      <pre>
        <button
          contentEditable={false}
          onClick={handleCopy}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded"
          style={{
            background: 'rgb(var(--bg-2))',
            color: 'rgb(var(--text-muted))',
            border: '1px solid rgb(var(--border))',
            lineHeight: 1,
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <NodeViewContent as="code" className={language ? `language-${language}` : undefined} />
      </pre>
    </NodeViewWrapper>
  )
}

export const CodeBlockWithCopy = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
})
