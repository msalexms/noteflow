import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Link2 } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { useSectionHoverPreview } from '../../components/SectionPreview/hoverPreviewContext'

// Interactive pill for a section relation. Resolves the target's live name from
// the store (so renames reflect), shows the standard hover preview, and navigates
// on click. If the target section no longer exists it renders a muted "broken" pill.
export function SectionRelationView({ node }: NodeViewProps) {
  const noteId: string = node.attrs.noteId
  const sectionId: string = node.attrs.sectionId
  const storedName: string = node.attrs.sectionName || 'Section'

  const navigateToSection = useNotesStore((s) => s.navigateToSection)
  const liveName = useNotesStore((s) => {
    const note = s.notes.find((n) => n.id === noteId)
    const section = note?.sections.find((sec) => sec.id === sectionId)
    return section?.name ?? null
  })

  const { previewProps } = useSectionHoverPreview()
  const broken = liveName === null
  const label = liveName ?? storedName

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (broken) return
    navigateToSection(noteId, sectionId)
  }

  // Hover preview only makes sense for existing targets.
  const hover = broken ? {} : previewProps(noteId, sectionId, { placement: 'cursor-below' })

  return (
    <NodeViewWrapper as="span" className="section-relation-wrapper">
      <span
        {...hover}
        contentEditable={false}
        onClick={handleClick}
        data-broken={broken ? 'true' : undefined}
        className="section-relation-pill"
        title={broken ? 'Section not found' : undefined}
      >
        <Link2 className="section-relation-icon" aria-hidden />
        <span className="section-relation-label">{label}</span>
      </span>
    </NodeViewWrapper>
  )
}
