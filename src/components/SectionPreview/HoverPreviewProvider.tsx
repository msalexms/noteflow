import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useNotesStore } from '../../stores/notesStore'
import { useSectionTagColorsStore } from '../../stores/sectionTagColorsStore'
import { SectionPreviewCard } from './SectionPreviewCard'
import {
  HoverPreviewContext,
  type Placement,
  type PreviewHandlers,
  type PreviewOptions,
} from './hoverPreviewContext'

// Delay before a hovered trigger opens its preview — long enough that sweeping
// the cursor across a row of section tabs doesn't flash a popover on each one.
const OPEN_DELAY = 380
// Gap (px) between the anchor element and the floating card (element-right mode).
const GAP = 8
// Offset of the card's top-left corner from the cursor (cursor-below mode), so it
// sits just below-right of the pointer instead of right under the arrow tip.
const CURSOR_OFFSET_X = 8
const CURSOR_OFFSET_Y = 14
// Keep the card this far from the viewport edges when clamping.
const VIEWPORT_MARGIN = 8
// The floating card is a touch smaller than the Note-overview grid cards.
const HOVER_WIDTH = 224
const HOVER_PREVIEW_HEIGHT = 118
const HOVER_PREVIEW_ZOOM = 0.58
// Used only for the first paint, before the card is measured — keeps the very
// first frame near its final spot so there's no visible jump.
const ESTIMATED_HEIGHT = 200

interface PreviewTarget {
  noteId: string
  sectionId?: string
  rect: DOMRect
  placement: Placement
}

// A zero-size DOMRect at a screen point — used as the anchor in cursor-below mode.
function pointRect(x: number, y: number): DOMRect {
  return { left: x, right: x, top: y, bottom: y, width: 0, height: 0, x, y, toJSON: () => ({}) } as DOMRect
}

export function HoverPreviewProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<PreviewTarget | null>(null)
  const timerRef = useRef<number | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const close = useCallback(() => {
    clearTimer()
    setTarget(null)
  }, [clearTimer])

  // Any click dismisses an open hover preview. This also fixes the editor case
  // where clicking a tab makes it active (dropping its mouse handlers), which
  // would otherwise leave the popover stuck open.
  useEffect(() => {
    const onDown = () => close()
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [close])

  const previewProps = useCallback(
    (noteId: string, sectionId: string, opts?: PreviewOptions): PreviewHandlers => {
      const placement = opts?.placement ?? 'element-right'
      const schedule = (getAnchor: () => DOMRect) => {
        clearTimer()
        timerRef.current = window.setTimeout(() => {
          setTarget({ noteId, sectionId, rect: getAnchor(), placement })
        }, OPEN_DELAY)
      }
      if (placement === 'cursor-below') {
        return {
          // Empty title suppresses any ancestor's native tooltip.
          title: '',
          onMouseEnter: (e: React.MouseEvent) => {
            pointerRef.current = { x: e.clientX, y: e.clientY }
            schedule(() => pointRect(pointerRef.current.x, pointerRef.current.y))
          },
          onMouseMove: (e: React.MouseEvent) => {
            pointerRef.current = { x: e.clientX, y: e.clientY }
          },
          onMouseLeave: () => close(),
        }
      }
      return {
        title: '',
        onMouseEnter: (e: React.MouseEvent) => {
          const r = e.currentTarget.getBoundingClientRect()
          schedule(() => r)
        },
        onMouseLeave: () => close(),
      }
    },
    [clearTimer, close],
  )

  const value = useMemo(() => ({ previewProps }), [previewProps])

  return (
    <HoverPreviewContext.Provider value={value}>
      {children}
      {target && <HoverPreviewPopover target={target} />}
    </HoverPreviewContext.Provider>
  )
}

const clampH = (v: number) => Math.max(VIEWPORT_MARGIN, Math.min(v, window.innerWidth - HOVER_WIDTH - VIEWPORT_MARGIN))

// Place the card: 'element-right' to the side of the anchor (flipped on overflow),
// 'cursor-below' centred just under the cursor (flipped above on overflow).
function computePos(target: PreviewTarget, height: number) {
  const { rect, placement } = target
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (placement === 'cursor-below') {
    // Top-left corner sits just below-right of the cursor, so the card extends down-right.
    const left = clampH(rect.left + CURSOR_OFFSET_X)
    let top = rect.bottom + CURSOR_OFFSET_Y
    if (top + height + VIEWPORT_MARGIN > vh) top = rect.top - CURSOR_OFFSET_Y - height
    if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN
    return { left, top }
  }
  let left = rect.right + GAP
  if (left + HOVER_WIDTH + VIEWPORT_MARGIN > vw) left = rect.left - GAP - HOVER_WIDTH
  left = clampH(left)
  let top = rect.top
  if (top + height + VIEWPORT_MARGIN > vh) top = vh - height - VIEWPORT_MARGIN
  if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN
  return { left, top }
}

// The single floating card. Resolves note/section straight from the store (all
// section content lives in memory).
function HoverPreviewPopover({ target }: { target: PreviewTarget }) {
  const note = useNotesStore((s) => s.notes.find((n) => n.id === target.noteId) ?? null)
  const sectionTagColors = useSectionTagColorsStore((s) => s.sectionTagColors)
  const ref = useRef<HTMLDivElement>(null)
  // First paint uses an estimated height so the card starts near its final spot;
  // it's still invisible (ready=false) until measured, so no jump is visible.
  const [pos, setPos] = useState(() => computePos(target, ESTIMATED_HEIGHT))
  const [ready, setReady] = useState(false)

  // A node may not carry a section id → fall back to the note's first one.
  const section =
    note?.sections.find((s) => s.id === target.sectionId) ?? note?.sections[0] ?? null

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !section) return
    setPos(computePos(target, el.offsetHeight))
    setReady(true)
  }, [target, section])

  // Section not in memory (e.g. an encrypted note that's still locked) → nothing
  // to preview.
  if (!note || !section) return null

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] pointer-events-none rounded-lg border border-solid border-text/25
                 bg-surface-1 shadow-xl overflow-hidden flex flex-col transition-opacity duration-100"
      style={{
        width: HOVER_WIDTH,
        left: pos.left,
        top: pos.top,
        opacity: ready ? 1 : 0,
      }}
    >
      <SectionPreviewCard
        note={note}
        section={section}
        sectionTagColors={sectionTagColors}
        compact
        previewHeight={HOVER_PREVIEW_HEIGHT}
        previewZoom={HOVER_PREVIEW_ZOOM}
      />
    </div>,
    document.body,
  )
}
