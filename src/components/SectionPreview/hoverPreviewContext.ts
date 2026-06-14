import { createContext, useContext } from 'react'

// 'element-right' anchors to the right of the trigger element (AI panels).
// 'cursor-below' hangs the card just below the cursor (sidebar / groups / editor),
// so it never covers the content to the right of the pointer.
export type Placement = 'element-right' | 'cursor-below'

export interface PreviewOptions {
  placement?: Placement
}

export interface PreviewHandlers {
  title: string
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseMove?: (e: React.MouseEvent) => void
  onMouseLeave: () => void
}

export interface HoverPreviewContextValue {
  // Spread the returned handlers onto any element that navigates to a section
  // to show a hover preview of that section's content.
  previewProps: (noteId: string, sectionId: string, opts?: PreviewOptions) => PreviewHandlers
}

export const HoverPreviewContext = createContext<HoverPreviewContextValue | null>(null)

export function useSectionHoverPreview(): HoverPreviewContextValue {
  const ctx = useContext(HoverPreviewContext)
  if (!ctx) throw new Error('useSectionHoverPreview must be used within a HoverPreviewProvider')
  return ctx
}
