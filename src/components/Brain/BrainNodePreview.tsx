import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNotesStore } from '../../stores/notesStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { SectionPreviewCard } from '../SectionPreview/SectionPreviewCard'

const WIDTH = 240
const MARGIN = 8
const CURSOR_GAP = 12
const ESTIMATED_HEIGHT = 220

export interface PinnedPreview {
  noteId: string
  sectionId?: string
  x: number // viewport coords of the click
  y: number
}

// Below the click, centred; flipped above if it would overflow the viewport.
function computePos(pinned: PinnedPreview, height: number) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = Math.max(MARGIN, Math.min(pinned.x - WIDTH / 2, vw - WIDTH - MARGIN))
  let top = pinned.y + CURSOR_GAP
  if (top + height + MARGIN > vh) top = pinned.y - CURSOR_GAP - height
  if (top < MARGIN) top = MARGIN
  return { left, top }
}

// A clickable preview card pinned next to a clicked brain node. Unlike the hover
// preview it stays put and navigates to the section when clicked. Dismisses on an
// outside click or Escape.
export function BrainNodePreview({
  pinned,
  onOpen,
  onDismiss,
}: {
  pinned: PinnedPreview
  onOpen: (noteId: string, sectionId?: string) => void
  onDismiss: () => void
}) {
  const note = useNotesStore((s) => s.notes.find((n) => n.id === pinned.noteId) ?? null)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const ref = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState(() => computePos(pinned, ESTIMATED_HEIGHT))

  const section = note?.sections.find((s) => s.id === pinned.sectionId) ?? note?.sections[0] ?? null

  // Re-place once the card is measured (real height may flip it above the click).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !section) return
    setPos(computePos(pinned, el.offsetHeight))
  }, [pinned, section])

  // Dismiss on outside click / Escape. Registered after mount, so the click that
  // opened the card (already handled on pointerup) doesn't immediately close it.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onDismiss()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onDismiss])

  if (!note || !section) return null

  return createPortal(
    <button
      ref={ref}
      onClick={() => onOpen(pinned.noteId, section.id)}
      title={`Open "${section.name}"`}
      className="group fixed z-[9999] text-left rounded-lg border border-solid border-text/30 bg-surface-1
                 shadow-2xl overflow-hidden flex flex-col cursor-pointer hover:border-text/55 transition-colors
                 animate-in fade-in zoom-in-95 duration-100"
      style={{ width: WIDTH, left: pos.left, top: pos.top }}
    >
      <SectionPreviewCard note={note} section={section} sectionTagColors={sectionTagColors} compact />
    </button>,
    document.body,
  )
}
