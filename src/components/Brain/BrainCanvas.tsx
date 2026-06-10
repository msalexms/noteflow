import { useEffect, useMemo, useRef, useState } from 'react'
import { useThemeStore } from '../../stores/themeStore'
import { readPalette, rgba, type BrainPalette } from './brainColors'
import { useForceLayout, type SimNode } from './useForceLayout'
import type { BrainGraphModel } from './useBrainGraph'

interface Props {
  model: BrainGraphModel
  showContentEdges: boolean
  onOpenNote: (noteId: string, sectionId?: string) => void
  onOpenGroup: (groupId: string) => void
}

const MIN_K = 0.15
const MAX_K = 4
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface Transform { x: number; y: number; k: number }

export function BrainCanvas({ model, showContentEdges, onOpenNote, onOpenGroup }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  const activeThemeId = useThemeStore((s) => s.activeThemeId)
  // Re-read the CSS-var palette whenever the theme changes (readPalette reads :root live).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palette = useMemo<BrainPalette>(() => readPalette(), [activeThemeId])

  const { simRef, nodesRef, reheat } = useForceLayout(model, size.width, size.height)

  // Mutable inputs the rAF loop reads without restarting. `size` is included so the draw loop
  // never reads canvas.clientWidth/Height itself — reading layout every frame forces a synchronous
  // reflow that preempts the browser's transition-generation step, breaking CSS animations
  // elsewhere (e.g. the sidebar calendar's expand). ResizeObserver already tracks the size for us.
  const renderRef = useRef({ model, showContentEdges, palette, onOpenNote, onOpenGroup, size })
  renderRef.current = { model, showContentEdges, palette, onOpenNote, onOpenGroup, size }

  // Interaction state (refs so the draw loop and listeners share without re-renders).
  const tRef = useRef<Transform>({ x: 0, y: 0, k: 1 })
  const hoverRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const dragRef = useRef<SimNode | null>(null)
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const movedRef = useRef(false)

  // Undirected content adjacency for fast highlight (rebuilt per model).
  const adjRef = useRef<Map<string, Map<string, number>>>(new Map())
  useEffect(() => {
    const adj = new Map<string, Map<string, number>>()
    for (const e of model.contentEdges) {
      ;(adj.get(e.source) ?? adj.set(e.source, new Map()).get(e.source)!).set(e.target, e.score)
      ;(adj.get(e.target) ?? adj.set(e.target, new Map()).get(e.target)!).set(e.source, e.score)
    }
    adjRef.current = adj
  }, [model])

  // Track container size.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight })
    })
    ro.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Single persistent render loop + input handling.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let raf = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const toScreen = (wx: number, wy: number): [number, number] => {
      const t = tRef.current
      return [wx * t.k + t.x, wy * t.k + t.y]
    }
    const toWorld = (sx: number, sy: number): [number, number] => {
      const t = tRef.current
      return [(sx - t.x) / t.k, (sy - t.y) / t.k]
    }
    const hitTest = (sx: number, sy: number): SimNode | null => {
      const nodes = nodesRef.current
      const k = tRef.current.k
      // topmost first
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        if (n.x == null || n.y == null) continue
        const [px, py] = toScreen(n.x, n.y)
        const r = Math.max(n.radius * k, 5) + 3
        if ((sx - px) ** 2 + (sy - py) ** 2 <= r * r) return n
      }
      return null
    }

    const draw = () => {
      const { model: m, showContentEdges: showContent, palette: pal, size: sz } = renderRef.current
      const { width, height } = sz
      if (width === 0 || height === 0) return
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const nodes = nodesRef.current
      const pos = new Map<string, SimNode>(nodes.map((n) => [n.id, n]))
      const k = tRef.current.k
      const focusId = hoverRef.current ?? selectedRef.current
      const neighbors = focusId ? adjRef.current.get(focusId) : undefined

      // ── Content edges (faint; bright when incident to the focused node) ──
      if (showContent) {
        for (const e of m.contentEdges) {
          const a = pos.get(e.source), b = pos.get(e.target)
          if (!a || !b || a.x == null || b.x == null) continue
          const incident = focusId === e.source || focusId === e.target
          const base = 0.05 + 0.12 * e.score
          const alpha = focusId ? (incident ? 0.55 + 0.4 * e.score : 0.02) : base
          if (alpha < 0.012) continue
          const [ax, ay] = toScreen(a.x, a.y!)
          const [bx, by] = toScreen(b.x, b.y!)
          ctx.strokeStyle = rgba(pal.text, alpha)
          ctx.lineWidth = incident ? 1.6 : 1
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
        }
      }

      // ── Structure edges (solid, colored by group) ──
      for (const e of m.structureEdges) {
        const a = pos.get(e.source), b = pos.get(e.target)
        if (!a || !b || a.x == null || b.x == null) continue
        const [ax, ay] = toScreen(a.x, a.y!)
        const [bx, by] = toScreen(b.x, b.y!)
        const dim = focusId && focusId !== a.id && focusId !== b.id && !neighbors?.has(b.id)
        ctx.strokeStyle = rgba(pal.color(b.colorVar), dim ? 0.12 : 0.4)
        ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
      }

      // ── Nodes ──
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue
        const [px, py] = toScreen(n.x, n.y)
        const r = Math.max(n.radius * k, 2.5)
        const isFocus = n.id === focusId
        const isNeighbor = !!neighbors?.has(n.id)
        const dim = !!focusId && !isFocus && !isNeighbor
        const rgb = pal.color(n.colorVar)

        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fillStyle = rgba(rgb, dim ? 0.18 : n.kind === 'note' ? 0.85 : 0.95)
        ctx.fill()
        if (n.kind !== 'note') {
          ctx.lineWidth = 1.5
          ctx.strokeStyle = rgba(pal.bg, dim ? 0.2 : 0.8)
          ctx.stroke()
        }
        if (isFocus || selectedRef.current === n.id) {
          ctx.lineWidth = 2
          ctx.strokeStyle = rgba(pal.text, 0.9)
          ctx.beginPath(); ctx.arc(px, py, r + 3, 0, Math.PI * 2); ctx.stroke()
        }

        // Labels: groups/folders always; notes/sections when zoomed in or focused/neighbor.
        const showLabel = n.kind === 'group' || n.kind === 'folder' || k > 1.3 || isFocus || isNeighbor
        if (showLabel && !dim) {
          const fontPx = clamp((n.kind === 'group' ? 13 : n.kind === 'folder' ? 12 : 11), 10, 16)
          ctx.font = `${fontPx}px ui-monospace, monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          const label = n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label
          ctx.fillStyle = rgba(n.kind === 'note' ? pal.textMuted : pal.text, isFocus ? 1 : 0.85)
          ctx.fillText(label, px, py + r + 3)
        }
      }
    }

    const tick = () => {
      const sim = simRef.current
      if (sim && (sim.alpha() > 0.006 || dragRef.current)) sim.tick()
      draw()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    // ── Pointer handling ──
    const getXY = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect()
      return [e.clientX - rect.left, e.clientY - rect.top]
    }
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      movedRef.current = false
      const [sx, sy] = getXY(e)
      const hit = hitTest(sx, sy)
      if (hit) {
        dragRef.current = hit
        const [wx, wy] = toWorld(sx, sy)
        hit.fx = wx; hit.fy = wy
        reheat(0.3)
      } else {
        const t = tRef.current
        panRef.current = { sx, sy, ox: t.x, oy: t.y }
      }
    }
    const onMove = (e: PointerEvent) => {
      const [sx, sy] = getXY(e)
      if (dragRef.current) {
        movedRef.current = true
        const [wx, wy] = toWorld(sx, sy)
        dragRef.current.fx = wx; dragRef.current.fy = wy
        reheat(0.25)
        return
      }
      if (panRef.current) {
        movedRef.current = true
        const p = panRef.current
        tRef.current = { ...tRef.current, x: p.ox + (sx - p.sx), y: p.oy + (sy - p.sy) }
        return
      }
      const hit = hitTest(sx, sy)
      hoverRef.current = hit ? hit.id : null
      canvas.style.cursor = hit ? (hit.kind === 'note' || hit.kind === 'group' ? 'pointer' : 'grab') : 'grab'
    }
    const endInteraction = (sx: number, sy: number) => {
      const node = dragRef.current
      if (node) {
        node.fx = null; node.fy = null
        if (!movedRef.current) {
          // a click, not a drag
          if (node.kind === 'note' && node.noteId) {
            renderRef.current.onOpenNote(node.noteId, node.sectionId)
          } else if (node.kind === 'group') {
            renderRef.current.onOpenGroup(node.refId)
          } else {
            selectedRef.current = selectedRef.current === node.id ? null : node.id
          }
        }
      } else if (panRef.current && !movedRef.current) {
        selectedRef.current = null // click on empty clears selection
      }
      void sx; void sy
      dragRef.current = null
      panRef.current = null
    }
    const onUp = (e: PointerEvent) => {
      const [sx, sy] = getXY(e)
      endInteraction(sx, sy)
    }
    const onLeave = () => { hoverRef.current = null }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top
      const t = tRef.current
      const factor = Math.exp(-e.deltaY * 0.0015)
      const newK = clamp(t.k * factor, MIN_K, MAX_K)
      // keep the world point under the cursor fixed
      const wx = (sx - t.x) / t.k, wy = (sy - t.y) / t.k
      tRef.current = { k: newK, x: sx - wx * newK, y: sy - wy * newK }
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
    }
  // The loop reads everything via refs; only re-create if the canvas element changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="w-full h-full block" style={{ touchAction: 'none' }} />
    </div>
  )
}
