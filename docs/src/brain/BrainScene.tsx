import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { readBrainPalette, type BrainPalette, type RGB } from './colors'
import { adaptiveDetail, buildBrainMesh, normalizeShape, rotateAround, type BrainMesh, type BrainShapeParams, type Vec3 } from './mesh'
import { assignVertices } from './assign'
import { type LookParams, DEFAULT_LOOK, loadTuner, saveTuner, type SculptSettings, DEFAULT_SCULPT } from './defaults'
import type { BrainGraphModel, BrainNodeKind } from './graph'

interface Props {
  model: BrainGraphModel
  themeKey?: string                  // changes when the page theme flips → re-read palette + rebuild
  showContentEdges?: boolean
  onOpenNote?: (noteId: string, sectionId?: string) => void
  onOpenGroup?: (groupId: string) => void
  highlightedNoteIds?: Set<string>   // notes cited by the latest chat answer — kept "lit" (labels shown)
  thinking?: boolean                 // chat is streaming a reply — auto-sweep content relations
  // Clicking a note/section node reports it (with the click position) so a pinned
  // preview card can open next to it.
  onNodeActivate?: (noteId: string, sectionId: string | undefined, clientX: number, clientY: number) => void
}

// Theme CSS vars are sRGB triples; tell three so it converts to its linear working space (else
// the linear→sRGB output gamma brightens every color — the "whitish" wash).
const rgbTo = ([r, g, b]: RGB) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)

// A soft round sprite so vertices read as fat dots rather than square points.
function makeDotTexture(): THREE.Texture {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

// A hollow ring (stroked circle, empty inside) for colourless nodes.
function makeRingTexture(): THREE.Texture {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = 'rgba(255,255,255,1)'
  ctx.lineWidth = 6
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 7, 0, Math.PI * 2); ctx.stroke()
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

interface SceneApi {
  rebuild: (p: BrainShapeParams) => void
  applyLook: (l: LookParams) => void
  rebuildData: (m: BrainGraphModel) => void
}

// Every node renders as a small bright centre dot + a coloured ring halo around it. The ring size
// conveys the hierarchy (group > folder > note > section); the centre dot is uniform and small.
const CENTER_SIZE = 0.014
const RING_SIZE: Record<BrainNodeKind, number> = { group: 0.075, folder: 0.052, note: 0.04, section: 0.026 }

// Flip to true (dev only) to bring back the live sculpting panel + control-point markers; all the
// tuner code is kept for future shape edits. The shape itself is locked to DEFAULT_BRAIN_PARAMS.
const SHOW_TUNER = false

/**
 * Three.js renderer for the immersive 3D brain (Phase 2.5). Imperative setup in a useEffect
 * (mirrors BrainCanvas: container + ResizeObserver + rAF), lazy-loaded by BrainView so `three`
 * only ships in this chunk. Phase A: the glowing empty scaffold (wireframe + fat vertex dots +
 * fog + bloom + pulse + orbit/zoom). A dev-only slider panel (BrainTuner) sculpts the shape live.
 */
export function BrainScene({
  model,
  themeKey = 'dark',
  showContentEdges = true,
  onOpenNote = () => {},
  onOpenGroup = () => {},
  highlightedNoteIds,
  thinking,
  onNodeActivate = () => {},
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palette = useMemo<BrainPalette>(() => readBrainPalette(), [themeKey])

  const saved = useMemo(() => (SHOW_TUNER ? loadTuner() : null), [])
  // normalizeShape fills any fields missing from older saved states (lobes/bulges/density). The
  // scaffold density (detail) tracks how many nodes there are (see the effect below) — unless the
  // dev tuner is open, where the slider owns it.
  const [shape, setShape] = useState<BrainShapeParams>(() => {
    const base = normalizeShape(saved?.shape)
    return SHOW_TUNER ? base : { ...base, detail: adaptiveDetail(model.nodes.length) }
  })
  // Merge over defaults so older saved looks missing new fields (e.g. bgDarken) don't break.
  const [look] = useState<LookParams>(() => ({ ...DEFAULT_LOOK, ...(saved?.look ?? {}) }))
  const [sculpt] = useState<SculptSettings>(() => ({ ...DEFAULT_SCULPT }))

  // Mutable inputs the rAF loop / handlers read without tearing down the scene.
  const renderRef = useRef({ model, showContentEdges, palette, onOpenNote, onOpenGroup, shape, look, sculpt, highlightedNoteIds, thinking, onNodeActivate })
  renderRef.current = { model, showContentEdges, palette, onOpenNote, onOpenGroup, shape, look, sculpt, highlightedNoteIds, thinking, onNodeActivate }
  const apiRef = useRef<SceneApi | null>(null)
  const assignmentRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const pal = renderRef.current.palette
    const bg = rgbTo(pal.bg)
    const bgLum = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b
    const isDark = bgLum < 0.5
    const wireBlend = isDark ? THREE.AdditiveBlending : THREE.NormalBlending
    // The scaffold's wire/dot opacities (0.05 / 0.32) are tuned for additive blending + bloom on a
    // dark bg, where even 5% accumulates into a visible glowing lattice. On a light bg the scaffold
    // falls back to normal blending (no additive build-up, no bloom), so those same opacities leave
    // the structure a barely-there grey that melts into the white. Raise the floor in light mode.
    const wireOpacityFor = (base: number) => (isDark ? base : Math.max(base, 0.5))
    const dotOpacityFor = (base: number) => (isDark ? base : Math.max(base, 0.75))

    // ── renderer / scene / camera ──
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(bg, 1) // canvas background = theme bg, never black
    let width = container.clientWidth || 1
    let height = container.clientHeight || 1
    renderer.setSize(width, height)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const fog = new THREE.Fog(bg.getHex(), renderRef.current.look.fogNear, renderRef.current.look.fogFar)
    scene.fog = fog
    // Background = (optionally darkened) theme bg. Applied here + live in applyLook.
    const applyBg = (darken: number) => {
      const d = bg.clone().multiplyScalar(1 - darken)
      renderer.setClearColor(d, 1)
      scene.background = d
      fog.color.copy(d)
    }
    applyBg(renderRef.current.look.bgDarken)

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    camera.position.set(0, 0.18, 2.95) // start a touch zoomed in (folders stay hidden until you zoom)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = 1.6
    controls.maxDistance = 7
    controls.target.set(0, -0.05, 0)
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.35

    // Scaffold tint: pull the text colour toward the bg so the lattice reads as a low-contrast
    // blue-grey instead of crisp white lines. Pull less on a light bg (normal blending darkens
    // rather than glows) so the scaffold doesn't fade into the background.
    const wireColor = rgbTo(pal.text).lerp(bg, isDark ? 0.44 : 0.22)

    // ── wireframe scaffold + fat vertex dots (geometry swapped on rebuild) ──
    const makeWireGeo = (m: BrainMesh) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
      g.setIndex(new THREE.BufferAttribute(m.edges, 1))
      return g
    }
    const makeDotGeo = (m: BrainMesh) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
      return g
    }

    let mesh = buildBrainMesh(renderRef.current.shape)

    // Everything that *is* the brain lives under one group (the cerebrum rotation is baked into the
    // vertex data, so this group itself isn't rotated — it's just a tidy container).
    const brainGroup = new THREE.Group()
    scene.add(brainGroup)

    const wireMat = new THREE.LineBasicMaterial({
      color: wireColor, transparent: true, opacity: wireOpacityFor(renderRef.current.look.wireOpacity),
      depthWrite: false, blending: wireBlend,
    })
    const wireframe = new THREE.LineSegments(makeWireGeo(mesh), wireMat)
    brainGroup.add(wireframe)

    const dotTex = makeDotTexture()
    const dotMat = new THREE.PointsMaterial({
      color: wireColor, map: dotTex, alphaTest: 0.02,
      size: renderRef.current.look.dotSize, transparent: true, opacity: dotOpacityFor(renderRef.current.look.dotOpacity),
      depthWrite: false, blending: wireBlend, sizeAttenuation: true,
    })
    const dots = new THREE.Points(makeDotGeo(mesh), dotMat)
    brainGroup.add(dots)

    // Invisible solid surface — raycast target for click-sculpting (material.visible:false isn't
    // rendered but the mesh still raycasts).
    const makeSolidGeo = (m: BrainMesh) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
      g.setIndex(new THREE.BufferAttribute(m.faces, 1))
      return g
    }
    const solid = new THREE.Mesh(makeSolidGeo(mesh), new THREE.MeshBasicMaterial({ visible: false }))
    brainGroup.add(solid)

    // Markers for the user's custom sculpt points (raise=warm, lower=cool, density=green).
    const markerTex = makeDotTexture()
    const markerMat = new THREE.PointsMaterial({
      map: markerTex, size: 0.06, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    const markers = new THREE.Points(new THREE.BufferGeometry(), markerMat)
    brainGroup.add(markers)
    const rebuildMarkers = (p: BrainShapeParams) => {
      const pos: number[] = [], col: number[] = []
      const S: Vec3 = [0, p.centerY, 0]
      const place = (x: number, y: number, z: number, r: number, g: number, b: number) => {
        const l = Math.hypot(x, y, z) || 1
        // Surface point for this control dir, then bake the same cerebrum rotation so the marker
        // tracks the rotated surface.
        const surf = rotateAround([(x / l) * 1.04, p.centerY + (y / l) * 1.04, (z / l) * 1.04], p.rotation, S)
        pos.push(surf[0], surf[1], surf[2]); col.push(r, g, b)
      }
      for (const bb of p.bulges) {
        if (bb.strength >= 0) place(bb.x, bb.y, bb.z, 1.0, 0.55, 0.2)
        else place(bb.x, bb.y, bb.z, 0.3, 0.6, 1.0)
      }
      for (const dp of p.densityPoints) place(dp.x, dp.y, dp.z, 0.35, 1.0, 0.45)
      markers.geometry.dispose()
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
      markers.geometry = g
      markers.visible = SHOW_TUNER && pos.length > 0
    }
    rebuildMarkers(renderRef.current.shape)

    // Data layer, split into sublayers so synapses can be toggled and (phase D) hover-highlighted.
    const dataGroup = new THREE.Group()
    brainGroup.add(dataGroup)
    const structureGroup = new THREE.Group() // routes group→folder→note along the scaffold
    const synapseGroup = new THREE.Group()   // content edges note↔note (routed through the interior)
    const dendriteGroup = new THREE.Group()  // note→section
    const nodeGroup = new THREE.Group()      // orbs + rings
    const hoverGroup = new THREE.Group() // bright incident synapses + marker for the hovered node
    const thinkGroup = new THREE.Group() // several concurrent relation-sweeps while the chat thinks
    const litGroup = new THREE.Group()   // pulsing halos over notes cited by the latest chat answer
    dataGroup.add(structureGroup, synapseGroup, dendriteGroup, nodeGroup, hoverGroup, thinkGroup, litGroup)

    // Pick + label bookkeeping, refreshed on each rebuildData.
    interface PlacedInfo {
      v: number; pos: THREE.Vector3; kind: BrainNodeKind; label: string; colorVar: string
      refId: string; noteId?: string; sectionId?: string
    }
    const placedNodes = new Map<string, PlacedInfo>()
    let pickPoints: { points: THREE.Points; ids: string[] }[] = []
    // Note node-ids (`n:<id>`) that have at least one content edge — the pool the "thinking" auto-
    // sweep cycles through. Refreshed on each rebuildData.
    let connectedNoteNodeIds: string[] = []

    const ringTex = makeRingTexture()
    const colorCache = new Map<string, THREE.Color>()
    const colorOf = (cssVar: string) => {
      let c = colorCache.get(cssVar)
      if (!c) { c = rgbTo(pal.color(cssVar)); colorCache.set(cssVar, c) }
      return c
    }
    const disposeObj = (obj: THREE.Object3D) => {
      const o = obj as THREE.Mesh
      o.geometry?.dispose()
      const mat = o.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose()); else mat?.dispose()
    }
    const clearGroup = (g: THREE.Group) => {
      for (const child of [...g.children]) { g.remove(child); disposeObj(child) }
    }
    const removeObj = (g: THREE.Group, obj: THREE.Object3D) => { g.remove(obj); disposeObj(obj) }
    const disposeData = () => [structureGroup, synapseGroup, dendriteGroup, nodeGroup].forEach(clearGroup)

    const lineGeo = (lp: number[], lc: number[]) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3))
      g.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3))
      return g
    }

    // Content-edge routes (note↔note), computed in one congestion-aware batch per rebuildData so
    // relations fan out onto parallel corridors instead of stacking onto a single line (where one
    // would hide the other). Keyed by the unordered vertex pair (min*N+max) — the mesh's scheme.
    let contentRoutes = new Map<number, number[]>()
    // Look up a content edge's batch route and orient it to start at `a` (the map is keyed on the
    // unordered pair, so it may come back reversed); callers reverse again as needed. Falls back to
    // a fresh interior route for any pair not in the batch.
    const routeContent = (a: number, b: number): number[] => {
      const key = a < b ? a * mesh.vertexCount + b : b * mesh.vertexCount + a
      const p = contentRoutes.get(key) ?? mesh.pathThroughInterior(a, b)
      if (!p || p.length < 2) return [a, b]
      return p[0] === a ? p : p.slice().reverse()
    }

    const rebuildData = (m: BrainGraphModel) => {
      disposeData()
      const assignment = assignVertices(mesh, m)
      assignmentRef.current = assignment
      const p = mesh.positions
      const nodeById = new Map(m.nodes.map((n) => [n.id, n]))
      const posOf = (v: number) => new THREE.Vector3(p[v * 3], p[v * 3 + 1], p[v * 3 + 2])

      placedNodes.clear(); pickPoints = []
      for (const node of m.nodes) {
        const v = assignment.get(node.id)
        if (v == null) continue
        placedNodes.set(node.id, {
          v, pos: posOf(v), kind: node.kind, label: node.label, colorVar: node.colorVar,
          refId: node.refId, noteId: node.noteId, sectionId: node.sectionId,
        })
      }

      // Batch-route every content edge at once (strongest relations first, so they win the directest
      // path and weaker ones detour around them). Used by both the static synapse lines below and the
      // hover/thinking sweeps, via routeContent.
      const routePairs: Array<readonly [number, number]> = []
      for (const e of [...m.contentEdges].sort((x, y) => y.score - x.score)) {
        const a = assignment.get(e.source), b = assignment.get(e.target)
        if (a != null && b != null) routePairs.push([a, b])
      }
      contentRoutes = mesh.routeContentEdges(routePairs)

      // Every placed node = a bright centre dot + a coloured ring halo around it.
      const allPlaced = m.nodes.filter((n) => assignment.has(n.id))

      // ── Centre dots (one Points, per-node colour) — also the main pick target ──
      if (allPlaced.length) {
        const arr = new Float32Array(allPlaced.length * 3), carr = new Float32Array(allPlaced.length * 3)
        allPlaced.forEach((node, i) => {
          const v = assignment.get(node.id)!
          arr[i * 3] = p[v * 3]; arr[i * 3 + 1] = p[v * 3 + 1]; arr[i * 3 + 2] = p[v * 3 + 2]
          // Notes a touch dimmer; groups a touch hotter so the bloom wraps them in a faint neon glow.
          const c = colorOf(node.colorVar).clone().multiplyScalar(
            node.colorVar === '--text' ? 1.1 : node.kind === 'note' ? 1.15 : node.kind === 'group' ? 1.95 : 1.5,
          )
          carr[i * 3] = c.r; carr[i * 3 + 1] = c.g; carr[i * 3 + 2] = c.b
        })
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
        g.setAttribute('color', new THREE.BufferAttribute(carr, 3))
        const pts = new THREE.Points(g, new THREE.PointsMaterial({
          map: dotTex, vertexColors: true, size: CENTER_SIZE, transparent: true,
          depthWrite: false, blending: wireBlend, sizeAttenuation: true, alphaTest: 0.02, toneMapped: false,
        }))
        nodeGroup.add(pts)
        pickPoints.push({ points: pts, ids: allPlaced.map((n) => n.id) })
      }

      // ── Ring halos (one Points per kind for its size; per-node colour) ──
      const byKind: Record<string, typeof allPlaced> = {}
      for (const node of allPlaced) (byKind[node.kind] ??= []).push(node)
      for (const kind of Object.keys(byKind)) {
        const list = byKind[kind]
        const arr = new Float32Array(list.length * 3), carr = new Float32Array(list.length * 3)
        list.forEach((node, i) => {
          const v = assignment.get(node.id)!
          arr[i * 3] = p[v * 3]; arr[i * 3 + 1] = p[v * 3 + 1]; arr[i * 3 + 2] = p[v * 3 + 2]
          const c = colorOf(node.colorVar).clone().multiplyScalar(
            node.colorVar === '--text' ? 0.8 : node.kind === 'group' ? 1.3 : 1.0,
          )
          carr[i * 3] = c.r; carr[i * 3 + 1] = c.g; carr[i * 3 + 2] = c.b
        })
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
        g.setAttribute('color', new THREE.BufferAttribute(carr, 3))
        const pts = new THREE.Points(g, new THREE.PointsMaterial({
          map: ringTex, vertexColors: true, size: RING_SIZE[kind as BrainNodeKind], transparent: true,
          opacity: kind === 'note' ? 0.72 : kind === 'group' ? 1.0 : 0.95, depthWrite: false, blending: wireBlend, sizeAttenuation: true, alphaTest: 0.02, toneMapped: false,
        }))
        nodeGroup.add(pts)
        pickPoints.push({ points: pts, ids: list.map((n) => n.id) })
      }

      // ── Dendrites: note→section short lines (group-coloured) ──
      {
        const lp: number[] = [], lc: number[] = []
        for (const e of m.structureEdges) {
          if (!e.target.startsWith('s:')) continue
          const a = assignment.get(e.source), b = assignment.get(e.target)
          if (a == null || b == null) continue
          const col = colorOf(nodeById.get(e.target)!.colorVar)
          lp.push(p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2])
          lc.push(col.r, col.g, col.b, col.r, col.g, col.b)
        }
        if (lp.length) {
          dendriteGroup.add(new THREE.LineSegments(lineGeo(lp, lc), new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: wireBlend, toneMapped: false,
          })))
        }
      }

      // ── Structure routes: group→folder→note lit along the scaffold via pathBetween ──
      {
        const lp: number[] = [], lc: number[] = []
        for (const e of m.structureEdges) {
          if (e.target.startsWith('s:')) continue // sections are dendrites, not routes
          const a = assignment.get(e.source), b = assignment.get(e.target)
          if (a == null || b == null) continue
          // Slight boost (HDR, feeds bloom) → a faint neon trace along the group hierarchy routes.
          const col = colorOf(nodeById.get(e.target)!.colorVar).clone().multiplyScalar(1.3)
          const path = mesh.pathBetween(a, b)
          const seq = path && path.length >= 2 ? path : [a, b]
          for (let i = 0; i < seq.length - 1; i++) {
            const u = seq[i], w = seq[i + 1]
            lp.push(p[u * 3], p[u * 3 + 1], p[u * 3 + 2], p[w * 3], p[w * 3 + 1], p[w * 3 + 2])
            lc.push(col.r, col.g, col.b, col.r, col.g, col.b)
          }
        }
        if (lp.length) {
          structureGroup.add(new THREE.LineSegments(lineGeo(lp, lc), new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.46, depthWrite: false, blending: wireBlend, toneMapped: false,
          })))
        }
      }

      // ── Synapses: content edges note↔note routed via pathThroughInterior (faint), hopping
      // vertex-to-vertex through the interior lattice so the trace dips through the core — no
      // free-floating cords. Shared segments stack → frequently-travelled edges glow more. ──
      {
        const syn = colorOf('--text')
        const lp: number[] = [], lc: number[] = []
        for (const e of m.contentEdges) {
          const a = assignment.get(e.source), b = assignment.get(e.target)
          if (a == null || b == null) continue
          const seq = routeContent(a, b)
          for (let i = 0; i < seq.length - 1; i++) {
            const u = seq[i], w = seq[i + 1]
            lp.push(p[u * 3], p[u * 3 + 1], p[u * 3 + 2], p[w * 3], p[w * 3 + 1], p[w * 3 + 2])
            lc.push(syn.r, syn.g, syn.b, syn.r, syn.g, syn.b)
          }
        }
        if (lp.length) {
          synapseGroup.add(new THREE.LineSegments(lineGeo(lp, lc), new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
          })))
        }
      }

      // Pool of placed notes that take part in at least one content edge — what the thinking sweep
      // visits (so it only ever lights nodes that actually have relations to reveal).
      const conn = new Set<string>()
      for (const e of m.contentEdges) {
        if (placedNodes.has(e.source)) conn.add(e.source)
        if (placedNodes.has(e.target)) conn.add(e.target)
      }
      connectedNoteNodeIds = [...conn]
    }
    rebuildData(renderRef.current.model)

    // ── Electric impulses (animated sparks) ──────────────────────────────────────
    // A spark is a short comet (a bright head + a few fading tail points) that travels a polyline.
    // Two flavours: hover sparks shoot from the focused node out along its content edges; ambient
    // sparks rarely crawl a random wireframe edge. Both are THREE.Points updated per-frame.
    interface PulsePath { pts: Float32Array; cum: Float32Array; total: number; r: number; g: number; b: number }
    const TAIL = 4 // points per comet (head + fading tail)
    const tmpV = new THREE.Vector3()
    const sampleAt = (pp: PulsePath, u: number, out: THREE.Vector3) => {
      const d = Math.max(0, Math.min(1, u)) * pp.total
      let i = 1
      while (i < pp.cum.length - 1 && pp.cum[i] < d) i++
      const j = i - 1
      const seg = pp.cum[i] - pp.cum[j] || 1
      const f = (d - pp.cum[j]) / seg
      out.set(
        pp.pts[j * 3] + (pp.pts[i * 3] - pp.pts[j * 3]) * f,
        pp.pts[j * 3 + 1] + (pp.pts[i * 3 + 1] - pp.pts[j * 3 + 1]) * f,
        pp.pts[j * 3 + 2] + (pp.pts[i * 3 + 2] - pp.pts[j * 3 + 2]) * f,
      )
    }
    // Bake a vertex-index sequence over the current mesh lattice into an arc-length polyline.
    const pathFromSeq = (seq: number[], col: THREE.Color): PulsePath => {
      const pos = mesh.positions
      const pts = new Float32Array(seq.length * 3)
      const cum = new Float32Array(seq.length)
      for (let i = 0; i < seq.length; i++) {
        pts[i * 3] = pos[seq[i] * 3]; pts[i * 3 + 1] = pos[seq[i] * 3 + 1]; pts[i * 3 + 2] = pos[seq[i] * 3 + 2]
        if (i > 0) {
          const dx = pts[i * 3] - pts[(i - 1) * 3]
          const dy = pts[i * 3 + 1] - pts[(i - 1) * 3 + 1]
          const dz = pts[i * 3 + 2] - pts[(i - 1) * 3 + 2]
          cum[i] = cum[i - 1] + Math.hypot(dx, dy, dz)
        }
      }
      return { pts, cum, total: cum[seq.length - 1] || 1, r: col.r, g: col.g, b: col.b }
    }
    const sparkMat = () => new THREE.PointsMaterial({
      map: dotTex, vertexColors: true, transparent: true, depthWrite: false,
      blending: wireBlend, sizeAttenuation: true, alphaTest: 0.02, toneMapped: false,
    })

    const fxGroup = new THREE.Group()
    brainGroup.add(fxGroup)

    // Hover sweep — each related edge is a polyline that starts dark and lights up from the hovered
    // node out to the far end on hover (a single sweep), then stays lit while hovering. The lines
    // live in hoverGroup (rebuilt/cleared by rebuildHover); the per-frame colour fill is below.
    interface HoverLine { colorAttr: THREE.BufferAttribute; arc: Float32Array; n: number; r: number; g: number; b: number }
    let hoverLines: HoverLine[] = []
    let hoverStartT = 0

    // ── Lit source notes (chat answer): a bright, additive halo over each cited note that the
    // animate loop pulses (blinks). Rebuilt only when the cited-note set changes. ──
    let litMat: THREE.PointsMaterial | null = null
    let lastLitKey = ''
    const rebuildLit = (noteIds: Set<string>) => {
      clearGroup(litGroup)
      litMat = null
      if (noteIds.size === 0) return
      const pos: number[] = [], col: number[] = []
      for (const info of placedNodes.values()) {
        if (info.kind !== 'note' || !info.noteId || !noteIds.has(info.noteId)) continue
        pos.push(info.pos.x, info.pos.y, info.pos.z)
        const c = colorOf(info.colorVar).clone().multiplyScalar(2.4) // HDR → strong bloom
        col.push(c.r, c.g, c.b)
      }
      if (pos.length === 0) return
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
      litMat = new THREE.PointsMaterial({
        map: ringTex, vertexColors: true, size: RING_SIZE.note * 1.9, transparent: true,
        opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, alphaTest: 0.02, toneMapped: false,
      })
      litGroup.add(new THREE.Points(g, litMat))
    }

    // Ambient sparks — a small fixed pool, only a few alive at once, drawn via drawRange.
    const AMBIENT_MAX = 6
    interface Ambient { path: PulsePath; start: number; dur: number }
    const ambient: Ambient[] = []
    let nextAmbientAt = 1.5
    const ambientCol = wireColor.clone().multiplyScalar(1.4)
    const ambientGeo = new THREE.BufferGeometry()
    ambientGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AMBIENT_MAX * TAIL * 3), 3))
    ambientGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(AMBIENT_MAX * TAIL * 3), 3))
    ambientGeo.setDrawRange(0, 0)
    const ambientMat = sparkMat(); ambientMat.size = 0.03
    const ambientPulse = new THREE.Points(ambientGeo, ambientMat)
    fxGroup.add(ambientPulse)

    // ── post-processing: bloom ──
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const L0 = renderRef.current.look
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height), L0.bloomStrength, L0.bloomRadius,
      Math.max(L0.bloomThreshold, bgLum),
    )
    composer.addPass(bloom)
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    composer.setSize(width, height)

    // ── live tuning hooks ──
    apiRef.current = {
      rebuild: (p) => {
        mesh = buildBrainMesh(p)
        wireframe.geometry.dispose(); wireframe.geometry = makeWireGeo(mesh)
        dots.geometry.dispose(); dots.geometry = makeDotGeo(mesh)
        solid.geometry.dispose(); solid.geometry = makeSolidGeo(mesh)
        rebuildMarkers(p)
        rebuildData(renderRef.current.model) // mesh positions changed → re-pin nodes
      },
      rebuildData,
      applyLook: (l) => {
        wireMat.opacity = wireOpacityFor(l.wireOpacity)
        dotMat.size = l.dotSize; dotMat.opacity = dotOpacityFor(l.dotOpacity)
        bloom.strength = l.bloomStrength; bloom.radius = l.bloomRadius
        bloom.threshold = Math.max(l.bloomThreshold, bgLum)
        fog.near = l.fogNear; fog.far = l.fogFar
        applyBg(l.bgDarken)
      },
    }

    // ── resize ──
    const ro = new ResizeObserver(() => {
      width = container.clientWidth || 1
      height = container.clientHeight || 1
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      composer.setSize(width, height)
      bloom.setSize(width, height)
    })
    ro.observe(container)

    // ── interaction (hover / labels / click→fly-in) ──
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let hoverId: string | null = null
    let selectedId: string | null = null
    let lastHoverBuilt: string | null = null
    // "Thinking" auto-sweeps: while the chat streams, spawn SEVERAL concurrent relation-sweeps that
    // blink in and fade out — many notes' content relations lit at once, not one at a time. Each
    // sweep is one note's incident-edge lines (+ marker) with its own start/lifetime, pooled and
    // capped. Prefers the cited notes when known, else any content-connected note.
    interface ThinkSweep { lines: HoverLine[]; marker: THREE.Points | null; objects: THREE.Object3D[]; start: number; dur: number }
    let thinkSweeps: ThinkSweep[] = []
    const THINK_MAX = 6
    let nextAutoSweepAt = 0
    let thinkingCursor = 0
    const pickThinkingNode = (): string | null => {
      if (!connectedNoteNodeIds.length) return null
      const lit = renderRef.current.highlightedNoteIds
      if (lit && lit.size) {
        const cited = connectedNoteNodeIds.filter((id) => {
          const info = placedNodes.get(id)
          return info?.noteId != null && lit.has(info.noteId)
        })
        if (cited.length) return cited[thinkingCursor++ % cited.length]
      }
      return connectedNoteNodeIds[(Math.random() * connectedNoteNodeIds.length) | 0]
    }
    // HTML label overlay (crisp themed text projected from 3D).
    const labelLayer = document.createElement('div')
    labelLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;'
    container.appendChild(labelLayer)
    const labelPool = new Map<string, HTMLDivElement>()
    const v3 = new THREE.Vector3()
    const updateLabels = () => {
      const camDist = camera.position.distanceTo(controls.target)
      // LOD tiers: groups always visible; folders appear with a little zoom (before notes); notes
      // need more zoom; sections only when focused (hover/selected).
      const showFolders = camDist < 2.8
      const showNotes = camDist < 2.2
      // On-screen size of a unit world-size point (sizeAttenuation), in CSS px, so the label can sit
      // just above the node's ring instead of on top of it — the gap tracks the node's screen size.
      const fovScale = height / (2 * Math.tan((camera.fov * Math.PI / 180) / 2))
      const active = new Set<string>()
      for (const [id, info] of placedNodes) {
        const focus = id === hoverId || id === selectedId
        const show = focus
          || info.kind === 'group'
          || (info.kind === 'folder' && showFolders)
          || (info.kind === 'note' && showNotes)
        if (!show) continue
        v3.copy(info.pos).project(camera)
        if (v3.z > 1) continue
        const x = (v3.x * 0.5 + 0.5) * width, y = (-v3.y * 0.5 + 0.5) * height
        if (x < -60 || x > width + 60 || y < -20 || y > height + 20) continue
        let el = labelPool.get(id)
        if (!el) {
          el = document.createElement('div')
          el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:11px Inter,system-ui,sans-serif;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.9);will-change:transform;'
          labelLayer.appendChild(el); labelPool.set(id, el)
        }
        el.textContent = info.label.length > 24 ? info.label.slice(0, 23) + '…' : info.label
        // Lift the label just above the node's visible ring (≈0.78 of the sprite radius) + a small
        // pad, so it stays clear of the node without floating off at any zoom.
        const ringPx = (RING_SIZE[info.kind] * fovScale) / Math.max(camera.position.distanceTo(info.pos), 0.001)
        const lift = Math.min(ringPx * 0.4 + 4, 110)
        el.style.left = `${x}px`; el.style.top = `${y - lift}px`
        el.style.color = colorOf(info.colorVar).getStyle()
        el.style.opacity = focus ? '1' : info.kind === 'group' ? '0.85' : '0.6'
        el.style.fontWeight = info.kind === 'group' ? '700' : '400'
        active.add(id)
      }
      for (const [id, el] of labelPool) if (!active.has(id)) { el.remove(); labelPool.delete(id) }
    }

    const pickAt = (clientX: number, clientY: number): { id: string; info: PlacedInfo } | null => {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      raycaster.params.Points.threshold = 0.035
      let bestId: string | null = null, bestDist = Infinity
      for (const pp of pickPoints) {
        const hits = raycaster.intersectObject(pp.points, false)
        if (hits.length && hits[0].index != null && hits[0].distance < bestDist) {
          bestDist = hits[0].distance; bestId = pp.ids[hits[0].index]
        }
      }
      const info = bestId ? placedNodes.get(bestId) : undefined
      return info ? { id: bestId!, info } : null
    }

    // Build the bright incident-synapse polylines (+ a node marker) for one note into `group`,
    // oriented OUTWARD from the node and starting fully dark — the animate loop fills each with
    // colour from the node end to the far end. Returns the per-line sweep state, the marker (so it
    // can fade) and every object created (so a transient sweep can remove just its own). Shared by
    // the manual hover (one at a time) and the thinking auto-sweeps (several concurrent).
    interface BuiltSweep { lines: HoverLine[]; marker: THREE.Points | null; objects: THREE.Object3D[] }
    const buildSweepLines = (id: string, group: THREE.Group): BuiltSweep => {
      const lines: HoverLine[] = []
      const objects: THREE.Object3D[] = []
      const info = placedNodes.get(id)
      if (!info) return { lines, marker: null, objects }
      // marker at the node
      const mg = new THREE.BufferGeometry()
      mg.setAttribute('position', new THREE.Float32BufferAttribute([info.pos.x, info.pos.y, info.pos.z], 3))
      const marker = new THREE.Points(mg, new THREE.PointsMaterial({
        map: ringTex, color: colorOf(info.colorVar).clone().multiplyScalar(1.8), size: 0.07,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, alphaTest: 0.02, toneMapped: false,
      }))
      group.add(marker); objects.push(marker)
      const noteId = info.noteId
      if (!noteId) return { lines, marker, objects }
      const m = renderRef.current.model
      const assignment = assignmentRef.current
      const pos = mesh.positions
      const self = `n:${noteId}`
      const col = colorOf(info.colorVar).clone().multiplyScalar(1.6)
      for (const e of m.contentEdges) {
        const isSrc = e.source === self, isTgt = e.target === self
        if (!isSrc && !isTgt) continue
        const a = assignment.get(e.source), b = assignment.get(e.target)
        if (a == null || b == null) continue
        let seq = routeContent(a, b)
        if (!isSrc) seq = seq.slice().reverse() // always start at the node
        const n = seq.length
        if (n < 2) continue
        const posArr = new Float32Array(n * 3)
        const arc = new Float32Array(n)
        for (let i = 0; i < n; i++) {
          posArr[i * 3] = pos[seq[i] * 3]; posArr[i * 3 + 1] = pos[seq[i] * 3 + 1]; posArr[i * 3 + 2] = pos[seq[i] * 3 + 2]
          if (i > 0) {
            const dx = posArr[i * 3] - posArr[(i - 1) * 3]
            const dy = posArr[i * 3 + 1] - posArr[(i - 1) * 3 + 1]
            const dz = posArr[i * 3 + 2] - posArr[(i - 1) * 3 + 2]
            arc[i] = arc[i - 1] + Math.hypot(dx, dy, dz)
          }
        }
        const total = arc[n - 1] || 1
        for (let i = 0; i < n; i++) arc[i] /= total // normalise to 0..1 along the edge
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
        const colorAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3) // starts black = off
        g.setAttribute('color', colorAttr)
        // THREE.Line interpolates colour between consecutive vertices → smooth lit/unlit boundary.
        const line = new THREE.Line(g, new THREE.LineBasicMaterial({
          vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
        }))
        group.add(line); objects.push(line)
        lines.push({ colorAttr, arc, n, r: col.r, g: col.g, b: col.b })
      }
      return { lines, marker, objects }
    }

    // Manual hover: one note's relations revealed at a time (persists while hovering).
    const rebuildHover = (id: string | null) => {
      clearGroup(hoverGroup)
      hoverLines = id ? buildSweepLines(id, hoverGroup).lines : []
    }

    // ── render loop ──
    const clock = new THREE.Clock()
    let raf = 0
    const animate = () => {
      const t = clock.getElapsedTime()
      const l = renderRef.current.look
      controls.update()
      synapseGroup.visible = renderRef.current.showContentEdges
      if (hoverId !== lastHoverBuilt) { rebuildHover(hoverId); lastHoverBuilt = hoverId; hoverStartT = t }
      updateLabels()

      // Thinking auto-sweeps: while streaming and not manually hovering, keep spawning concurrent
      // relation-sweeps (capped) so several notes light up at once; clear the pool otherwise.
      if (!hoverId && renderRef.current.thinking && connectedNoteNodeIds.length) {
        if (t >= nextAutoSweepAt && thinkSweeps.length < THINK_MAX) {
          const id = pickThinkingNode()
          const built = id ? buildSweepLines(id, thinkGroup) : null
          if (built && built.lines.length) thinkSweeps.push({ ...built, start: t, dur: 0.6 + Math.random() * 0.3 })
          else if (built) built.objects.forEach((o) => removeObj(thinkGroup, o)) // node had no drawable edges
          nextAutoSweepAt = t + 0.16 + Math.random() * 0.12
        }
      } else if (thinkSweeps.length) {
        clearGroup(thinkGroup)
        thinkSweeps = []
      }

      // ── Lit source notes: rebuild on change, then blink the halo. ──
      const litSet = renderRef.current.highlightedNoteIds
      const litKey = litSet && litSet.size ? [...litSet].sort().join(',') : ''
      if (litKey !== lastLitKey) { rebuildLit(litSet ?? new Set()); lastLitKey = litKey }
      if (litMat) litMat.opacity = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 4.5))

      // ── Hover sweep: the related edge starts dark and lights up ONCE from the hovered node to the
      // far end (a fast colour fill, not a dot moving over an already-lit line); then stays lit. ──
      const EDGE = 0.06 // soft leading edge width, in normalised arc units
      if (hoverLines.length) {
        const h = Math.min(2, (t - hoverStartT) / 0.22) // sweep position (>1 = fully lit, resting)
        for (const hl of hoverLines) {
          const ca = hl.colorAttr
          for (let i = 0; i < hl.n; i++) {
            const f = Math.max(0, Math.min(1, (h - hl.arc[i]) / EDGE)) // 1 behind the sweep, 0 ahead
            ca.setXYZ(i, hl.r * f, hl.g * f, hl.b * f)
          }
          ca.needsUpdate = true
        }
      }

      // ── Thinking sweeps: each pooled sweep fills fast (a quick blink) from its note outward, holds,
      // then fades out over the tail of its life; expired ones are removed. Several overlap at once. ──
      for (let s = thinkSweeps.length - 1; s >= 0; s--) {
        const sw = thinkSweeps[s]
        const age = t - sw.start
        if (age >= sw.dur) { for (const o of sw.objects) removeObj(thinkGroup, o); thinkSweeps.splice(s, 1); continue }
        const h = age / 0.1 // snappy fill
        const life = age / sw.dur
        const env = life < 0.6 ? 1 : 1 - (life - 0.6) / 0.4 // hold, then fade over the last 40%
        if (sw.marker) (sw.marker.material as THREE.PointsMaterial).opacity = env
        for (const hl of sw.lines) {
          const ca = hl.colorAttr
          for (let i = 0; i < hl.n; i++) {
            const f = Math.max(0, Math.min(1, (h - hl.arc[i]) / EDGE)) * env
            ca.setXYZ(i, hl.r * f, hl.g * f, hl.b * f)
          }
          ca.needsUpdate = true
        }
      }

      // ── Ambient sparks: rare, faint comets crawling random wireframe edges ──
      if (t >= nextAmbientAt && ambient.length < AMBIENT_MAX && mesh.edges.length >= 2) {
        const ei = (Math.random() * (mesh.edges.length / 2)) | 0
        let a = mesh.edges[ei * 2], b = mesh.edges[ei * 2 + 1]
        if (Math.random() < 0.5) { const tmp = a; a = b; b = tmp }
        ambient.push({ path: pathFromSeq([a, b], ambientCol), start: t, dur: 0.3 + Math.random() * 0.2 })
        nextAmbientAt = t + 2.2 + Math.random() * 3 // sparse, irregular cadence
      }
      {
        for (let i = ambient.length - 1; i >= 0; i--) if ((t - ambient[i].start) / ambient[i].dur >= 1) ambient.splice(i, 1)
        const posAttr = ambientGeo.getAttribute('position') as THREE.BufferAttribute
        const colAttr = ambientGeo.getAttribute('color') as THREE.BufferAttribute
        let w = 0
        for (const am of ambient) {
          const head = (t - am.start) / am.dur
          const env = Math.sin(Math.PI * Math.min(head, 1)) // fade in then out → very discreet
          for (let k = 0; k < TAIL; k++) {
            const u = head - k * 0.06
            sampleAt(am.path, u, tmpV)
            posAttr.setXYZ(w, tmpV.x, tmpV.y, tmpV.z)
            const f = (u >= 0 ? env : 0) * (1 - k / TAIL)
            colAttr.setXYZ(w, am.path.r * f, am.path.g * f, am.path.b * f)
            w++
          }
        }
        posAttr.needsUpdate = true; colAttr.needsUpdate = true
        ambientGeo.setDrawRange(0, w)
      }

      // Temporal pulse: gentle breathing of the global glow.
      bloom.strength = l.bloomStrength + 0.08 * Math.sin(t * 1.1)
      wireMat.opacity = wireOpacityFor(l.wireOpacity) + 0.015 * Math.sin(t * 1.1 + 1)
      composer.render()
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)

    // ── pointer: orbit (drag) · sculpt or node-click (quick click) · hover ──
    let downX = 0, downY = 0, moved = false, pointerActive = false
    const stopAuto = () => { controls.autoRotate = false }
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; moved = false; pointerActive = true; controls.autoRotate = false }
    const onMove = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true
      if (pointerActive || renderRef.current.sculpt.enabled) return
      const hit = pickAt(e.clientX, e.clientY)
      hoverId = hit ? hit.id : null
      renderer.domElement.style.cursor = hit && (hit.info.kind === 'note' || hit.info.kind === 'section' || hit.info.kind === 'group') ? 'pointer' : 'grab'
    }
    const onUp = (e: PointerEvent) => {
      pointerActive = false
      if (moved) return
      const sc = renderRef.current.sculpt
      if (sc.enabled) {
        const rect = renderer.domElement.getBoundingClientRect()
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(ndc, camera)
        const hits = raycaster.intersectObject(solid, false)
        if (!hits.length) return
        const cur = renderRef.current.shape
        // Undo the baked cerebrum rotation to recover the base surface direction the deformation uses.
        const hp = hits[0].point
        const S: Vec3 = [0, cur.centerY, 0]
        const base = rotateAround([hp.x, hp.y, hp.z], cur.rotation, S, true)
        const dir = new THREE.Vector3(base[0] - S[0], base[1] - S[1], base[2] - S[2]).normalize()
        const next = structuredClone(cur)
        if (sc.tool === 'density') next.densityPoints.push({ x: dir.x, y: dir.y, z: dir.z, radius: sc.radius, level: sc.level })
        else next.bulges.push({ x: dir.x, y: dir.y, z: dir.z, radius: sc.radius, strength: sc.tool === 'raise' ? sc.strength : -sc.strength })
        setShape(next)
        return
      }
      // node click: notes/sections pin a preview card; groups open their overview; folders toggle selection
      const hit = pickAt(e.clientX, e.clientY)
      if (!hit) { selectedId = null; return }
      if ((hit.info.kind === 'note' || hit.info.kind === 'section') && hit.info.noteId) {
        renderRef.current.onNodeActivate(hit.info.noteId, hit.info.sectionId, e.clientX, e.clientY)
      } else if (hit.info.kind === 'group') renderRef.current.onOpenGroup(hit.info.refId)
      else selectedId = selectedId === hit.id ? null : hit.id
    }
    const onLeave = () => { hoverId = null }
    renderer.domElement.addEventListener('pointerdown', stopAuto)
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', stopAuto)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      apiRef.current = null
      controls.dispose()
      for (const el of labelPool.values()) el.remove()
      if (labelLayer.parentNode === container) container.removeChild(labelLayer)
      wireframe.geometry.dispose(); wireMat.dispose()
      dots.geometry.dispose(); dotMat.dispose(); dotTex.dispose()
      solid.geometry.dispose(); (solid.material as THREE.Material).dispose()
      markers.geometry.dispose(); markerMat.dispose(); markerTex.dispose()
      disposeData(); clearGroup(hoverGroup); clearGroup(thinkGroup); clearGroup(litGroup); ringTex.dispose()
      ambientGeo.dispose(); ambientMat.dispose()
      composer.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement)
    }
  // Rebuild only when the theme changes (palette). Shape/look update live via apiRef.
  }, [themeKey, setShape])

  // Push live tuner changes into the scene + persist (only while the tuner is shown).
  useEffect(() => { apiRef.current?.rebuild(shape); if (SHOW_TUNER) saveTuner({ shape, look }) }, [shape, look])
  useEffect(() => { apiRef.current?.applyLook(look) }, [look])
  // Re-pin nodes whenever the graph (notes/groups/content) changes.
  useEffect(() => { apiRef.current?.rebuildData(model) }, [model])
  // Grow/shrink the scaffold density with the node count (sparse for a few notes, denser as the
  // graph fills up). adaptiveDetail snaps to 0.1 steps so this only rebuilds the mesh when the
  // density actually changes, not on every note edit. The dev tuner owns detail when it's open.
  useEffect(() => {
    if (SHOW_TUNER) return
    const d = adaptiveDetail(model.nodes.length)
    setShape((prev) => (prev.detail === d ? prev : { ...prev, detail: d }))
  }, [model.nodes.length])

  return <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
}

export default BrainScene
