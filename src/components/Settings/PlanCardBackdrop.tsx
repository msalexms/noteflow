import { useEffect, useRef } from 'react'

// Fondo animado de las plan cards: una malla diminuta de nodos que de vez en cuando
// dispara un "spark" de color que zig-zaguea por ella — un eco reducido y con scope
// del fondo "brain" de la web (docs/public/brain/nf-netbg.js). Canvas autocontenido,
// sin dependencias. Lee los tokens de tema de la app (--text-muted para los cables,
// --accent/-2/-3 para los destellos) así que recolorea con cada tema. Respeta
// prefers-reduced-motion (dibuja un frame estático, sin loop) y pausa mientras la
// pestaña está oculta.

function readTriple(name: string, fallback: [number, number, number]): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const p = raw.split(/[\s,]+/).map(Number)
  return p.length >= 3 && p.every((n) => !Number.isNaN(n)) ? [p[0], p[1], p[2]] : fallback
}

type Node = {
  x: number; y: number; r: number; ph: number; sp: number
  lit: number; litCol?: number[]; near: Node[]
}
type Edge = { a: Node; b: Node }
type Spark = { path: Node[]; cum: number[]; len: number; col: number[]; s: number; dur: number }

export function PlanCardBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let wire: [number, number, number] = [86, 95, 137]
    let accents: [number, number, number][] = []
    const readColors = () => {
      wire = readTriple('--text-muted', [86, 95, 137])
      accents = [
        readTriple('--accent', [122, 162, 247]),
        readTriple('--accent-2', [158, 206, 106]),
        readTriple('--accent-3', [224, 175, 104]),
      ]
    }
    readColors()

    let w = 0, h = 0
    let nodes: Node[] = []
    let edges: Edge[] = []
    const sparks: Spark[] = []
    let nextSpark = 2 + Math.random() * 3

    const build = () => {
      nodes = []
      edges = []
      // In-flight sparks reference the old node objects; drop them so a rebuild
      // (resize) can't draw a stale trail for the spark's remaining lifetime.
      sparks.length = 0
      const target = Math.max(6, Math.min(22, Math.round((w * h) / 3400)))
      const cols = Math.max(2, Math.round(Math.sqrt((target * w) / h)))
      const rows = Math.max(2, Math.round(target / cols))
      const cw = w / cols, ch = h / rows
      // Extend the grid one full cell past every edge (origin at -cw/-ch, and two
      // extra cols/rows) so the mesh bleeds off the card instead of sitting half a
      // cell inside it — overflow-hidden clips the excess, so it reads as an
      // unbounded web that just happens to pass under this card.
      for (let r = -1; r <= rows; r++) {
        for (let c = -1; c <= cols; c++) {
          nodes.push({
            x: (c + 0.5 + (Math.random() - 0.5) * 0.7) * cw,
            y: (r + 0.5 + (Math.random() - 0.5) * 0.7) * ch,
            r: 0.9 + Math.random() * 1.1, ph: Math.random() * 6.2832,
            sp: 0.4 + Math.random() * 0.8, lit: 0, near: [],
          })
        }
      }
      const maxR = Math.hypot(cw, ch) * 1.5
      const seen = new Set<number>()
      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i]
        const cands: { j: number; o: Node; d: number }[] = []
        for (let j = 0; j < nodes.length; j++) {
          if (j === i) continue
          const o = nodes[j]
          const d = Math.hypot(o.x - nd.x, o.y - nd.y)
          if (d < maxR) cands.push({ j, o, d })
        }
        cands.sort((p, q) => p.d - q.d)
        let added = 0
        for (const cand of cands) {
          if (added >= 3) break
          const a = Math.min(i, cand.j), b = Math.max(i, cand.j)
          const key = a * 100003 + b
          if (seen.has(key)) continue
          seen.add(key)
          edges.push({ a: nd, b: cand.o })
          added++
        }
      }
      for (const e of edges) { e.a.near.push(e.b); e.b.near.push(e.a) }
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      w = Math.max(1, rect.width); h = Math.max(1, rect.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      build()
      if (reduced) drawStatic()
    }

    const wcol = (a: number) => `rgba(${wire[0]},${wire[1]},${wire[2]},${a.toFixed(3)})`

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = 1
      ctx.strokeStyle = wcol(0.12)
      for (const e of edges) { ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke() }
      ctx.fillStyle = wcol(0.3)
      for (const nd of nodes) { ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r, 0, 6.2832); ctx.fill() }
    }

    const spawnSpark = (t: number) => {
      if (nodes.length < 2) return
      const col = accents[(Math.random() * accents.length) | 0]
      const start = nodes[(Math.random() * nodes.length) | 0]
      const hops = 3 + ((Math.random() * 5) | 0)
      const path: Node[] = [start]
      let prev: Node | null = null, cur = start
      for (let i = 0; i < hops; i++) {
        const near = cur.near
        if (!near.length) break
        let hx = 0, hy = 0
        if (prev) { hx = cur.x - prev.x; hy = cur.y - prev.y; const m = Math.hypot(hx, hy) || 1; hx /= m; hy /= m }
        let next: Node | null = null, best = -Infinity
        for (const cand of near) {
          if (cand === prev || path.indexOf(cand) !== -1) continue
          let score = Math.random()
          if (prev) {
            const dx = cand.x - cur.x, dy = cand.y - cur.y, m = Math.hypot(dx, dy) || 1
            score += 0.7 * ((dx / m) * hx + (dy / m) * hy)
          }
          if (score > best) { best = score; next = cand }
        }
        if (!next) break
        path.push(next); prev = cur; cur = next
      }
      if (path.length < 2) return
      const cum = [0]
      for (let i = 1; i < path.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y))
      }
      const len = cum[cum.length - 1] || 1
      const dur = 0.4 + (len / Math.max(w, h)) * 0.5 + Math.random() * 0.2
      sparks.push({ path, cum, len, col, s: t, dur })
    }

    let raf = 0, t0 = 0, hiddenAt = 0
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop)
      if (!t0) t0 = ts
      const t = (ts - t0) / 1000
      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = 1
      for (const e of edges) {
        const base = 0.08 + 0.03 * Math.sin(t + e.a.ph)
        const lit = e.a.lit > e.b.lit ? e.a.lit : e.b.lit
        ctx.strokeStyle = wcol(base + lit * 0.5)
        ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke()
      }
      if (t >= nextSpark) { spawnSpark(t); nextSpark = t + 2.5 + Math.random() * 4 }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        const f = (t - s.s) / s.dur
        if (f >= 1) { sparks.splice(i, 1); continue }
        const env = Math.sin(Math.PI * f)
        const c = s.col
        const ccol = (a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`
        const { path, cum } = s
        const trav = s.len * f
        let seg = 0
        while (seg < cum.length - 2 && cum[seg + 1] <= trav) seg++
        const segLen = (cum[seg + 1] - cum[seg]) || 1
        const lf = Math.min(1, Math.max(0, (trav - cum[seg]) / segLen))
        const px = path[seg].x + (path[seg + 1].x - path[seg].x) * lf
        const py = path[seg].y + (path[seg + 1].y - path[seg].y) * lf
        ctx.lineWidth = 1.3
        ctx.strokeStyle = ccol(0.22 * env)
        ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y)
        for (let k = 1; k < path.length; k++) ctx.lineTo(path[k].x, path[k].y)
        ctx.stroke()
        ctx.strokeStyle = ccol(0.6 * env)
        ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y)
        for (let k = 1; k <= seg; k++) ctx.lineTo(path[k].x, path[k].y)
        ctx.lineTo(px, py)
        ctx.stroke()
        ctx.lineWidth = 1
        ctx.fillStyle = ccol(0.95 * env)
        ctx.beginPath(); ctx.arc(px, py, 2, 0, 6.2832); ctx.fill()
        for (let k = 0; k < path.length; k++) {
          const d = trav - cum[k]
          const g = d >= 0 ? Math.max(0, 1 - d / 70) : Math.max(0, 1 + d / 30)
          if (g > 0) { path[k].lit = Math.max(path[k].lit, g * env); path[k].litCol = c }
        }
      }
      for (const nd of nodes) {
        nd.lit *= 0.92
        const tw = 0.5 + 0.5 * Math.sin(t * nd.sp + nd.ph)
        const al = Math.min(1, 0.24 * (0.45 + 0.55 * tw) + nd.lit * 0.6)
        ctx.fillStyle = wcol(al)
        ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r * (1 + nd.lit * 0.7), 0, 6.2832); ctx.fill()
        if (nd.lit > 0.05 && nd.litCol) {
          const lc = nd.litCol
          ctx.fillStyle = `rgba(${lc[0]},${lc[1]},${lc[2]},${(nd.lit * 0.85).toFixed(3)})`
          ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r * (0.9 + nd.lit * 0.6), 0, 6.2832); ctx.fill()
          ctx.fillStyle = `rgba(${lc[0]},${lc[1]},${lc[2]},${(nd.lit * 0.2).toFixed(3)})`
          ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r * 3.2 * (0.5 + nd.lit), 0, 6.2832); ctx.fill()
        }
      }
    }

    const ro = new ResizeObserver(() => resize())
    ro.observe(canvas)
    resize()

    const mo = new MutationObserver(() => { readColors(); if (reduced) drawStatic() })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] })

    const onVis = () => {
      if (reduced) return
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; hiddenAt = performance.now() }
      else { if (hiddenAt && t0) t0 += performance.now() - hiddenAt; hiddenAt = 0; if (!raf) raf = requestAnimationFrame(loop) }
    }
    document.addEventListener('visibilitychange', onVis)

    if (!reduced) raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full pointer-events-none" />
}
