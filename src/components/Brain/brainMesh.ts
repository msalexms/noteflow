// The scaffold of "El Cerebro 3D": a procedural, asset-free brain silhouette. An icosphere is
// deformed by a radial brain function (elongated ellipsoid + domed top / tapered+flattened base +
// longitudinal fissure + temporal bulges + value noise) forms the OUTER silhouette. The interior
// is then filled with RANDOM loose vertices wired to their nearest neighbours (short edges only),
// so the brain has real interior volume without nested shells. A small lumpy cerebellum sphere
// and a short brain-stem stalk are fused in. Edges come straight from the icosphere triangles +
// the interior nearest-neighbour links — no Delaunay. (`shells` can still nest copies if set.)
//
// Local control: the user shapes specific spots via CONTROL POINTS — gaussians over the surface
// direction. `bulges` push/pull a region (rounder/bigger or dented); `densityPoints` trigger
// adaptive face subdivision (more vertices/edges) near a spot. Per-lobe sliders are just presets
// of these points. Click-sculpting in BrainScene appends custom ones.
//
// Vertices double as anchor points where graph nodes get pinned (assignVertices.ts), plus
// per-vertex region labels (lobes), adjacency and BFS pathfinding. All shape lives in
// BrainShapeParams. Everything is deterministic (fixed hash noise, fixed topology).

export type Vec3 = [number, number, number]

export const REGIONS = ['frontal', 'parietal', 'temporal', 'occipital', 'cerebellum', 'stem'] as const
export type Region = (typeof REGIONS)[number]
export const REGION_CODE: Record<Region, number> = {
  frontal: 0, parietal: 1, temporal: 2, occipital: 3, cerebellum: 4, stem: 5,
}
export type Lobe = 'frontal' | 'parietal' | 'temporal' | 'occipital'

// A sculpt control point: a gaussian over the surface direction (x,y,z normalized).
export interface BulgePoint { x: number; y: number; z: number; radius: number; strength: number }
export interface DensityPoint { x: number; y: number; z: number; radius: number; level: number }

// Random interior fill: scatter loose vertices through the cerebrum volume and wire each to its
// nearest neighbours, so the brain reads as a filled lattice (not a hollow shell or nested shells)
// with short edges only. fillDensity = interior points per surface vertex; margin keeps points
// inside the surface; neighbors = how many nearest vertices each one links to; maxEdge caps edge
// length so nothing stretches across the brain.
export interface InteriorFill { fillDensity: number; margin: number; neighbors: number; maxEdge: number }

export interface LobeControl { scale: number; density: number }

export interface BrainShapeParams {
  detail: number
  ax: number; ay: number; az: number
  topDome: number
  bottomTaper: number
  bottomFlatten: number
  baseFlatten: number
  fissureDepth: number; fissureWidth: number; hemisphereSpread: number
  temporalBulge: number
  noiseAmp: number; noiseFreq: number
  shells: number[]
  interior: InteriorFill
  centerY: number
  rotation: Vec3   // cerebrum-only orientation in degrees, baked into the cerebrum vertices
                   // (cerebellum + stem stay fixed); pivot = shape center (0, centerY, 0)
  lobes: Record<Lobe, LobeControl>
  bulges: BulgePoint[]
  densityPoints: DensityPoint[]
  cerebellum: { detail: number; scale: Vec3; center: Vec3; wrinkleAmp: number; wrinkleFreq: number }
  stem: { points: number; top: Vec3; bottom: Vec3; strands: number; spread: number }
}

// Baked from the design session (the user's final sculpt in the Brain Tuner).
export const DEFAULT_BRAIN_PARAMS: BrainShapeParams = {
  detail: 2.4,
  ax: 0.8, ay: 0.83, az: 1.15,
  topDome: 0.13,
  bottomTaper: 0.34,
  bottomFlatten: 0,
  baseFlatten: 0.72,
  fissureDepth: 0.16, fissureWidth: 0.08, hemisphereSpread: 0.04,
  temporalBulge: 0.11,
  noiseAmp: 0.065, noiseFreq: 2.4,
  shells: [1], // single outer shell = the brain silhouette; the interior is filled below
  // Random interior lattice (region-tagged → notes can live inside too, not just on the surface).
  interior: { fillDensity: 1.4, margin: 0.92, neighbors: 3, maxEdge: 0.4 },
  centerY: 0.2,
  rotation: [-8, 0, 0],
  lobes: {
    frontal: { scale: 0.81, density: 0 },
    parietal: { scale: 0.74, density: 0 },
    temporal: { scale: 0.9, density: 0 },
    occipital: { scale: 0.9, density: 0 },
  },
  bulges: [
    { x: 0.36258189862548323, y: -0.6148027480554756, z: 0.7003941374487475, radius: 0.35, strength: -0.14 },
    { x: 0.0014222987611771703, y: -0.6511899177061468, z: 0.7589134786944395, radius: 0.35, strength: -0.14 },
    { x: -0.3494717980173508, y: -0.6247386732824586, z: 0.6982628820836703, radius: 0.35, strength: -0.14 },
    { x: 0.562971642608837, y: -0.6270229992367372, z: 0.5384283499654103, radius: 0.35, strength: -0.14 },
    { x: -0.5986325830260595, y: -0.5479024454905748, z: 0.5843303353112826, radius: 0.35, strength: -0.14 },
    { x: 0.5410098214688089, y: -0.8327376423924832, z: 0.11771317690427256, radius: 0.35, strength: 0.14 },
    { x: 0.019433177709388558, y: -0.9760790587453959, z: 0.2165456595797231, radius: 0.35, strength: 0.14 },
    { x: -0.36302245328870864, y: -0.909984043042981, z: 0.20035902728701133, radius: 0.35, strength: 0.14 },
    { x: -0.025401903091053436, y: -0.5409730914569073, z: 0.8406562065665781, radius: 0.5, strength: 0.06 },
    { x: -0.02133451094986953, y: -0.582068046492168, z: 0.8128601527294356, radius: 0.5, strength: 0.06 },
  ],
  densityPoints: [],
  cerebellum: {
    detail: 2, scale: [0.26, 0.22, 0.36], center: [0.01, -0.6, -0.51], wrinkleAmp: 0.28, wrinkleFreq: 7,
  },
  stem: { points: 9, top: [-0.01, -0.53, -0.12], bottom: [0.01, -1.06, -0.33], strands: 4, spread: 0.075 },
}

// Lobe-wide control points sit at these directions; a slider != neutral injects a wide gaussian.
const LOBE_CENTERS: Record<Lobe, Vec3[]> = {
  frontal: [[0, 0.15, 1]],
  parietal: [[0, 1, -0.1]],
  temporal: [[0.95, -0.35, 0.2], [-0.95, -0.35, 0.2]],
  occipital: [[0, 0.15, -1]],
}
const LOBE_RADIUS = 1.0       // angular falloff (radians) for a lobe-wide effect
const LOBE_BULGE_GAIN = 0.6   // maps (scale-1) → bulge strength

export interface BrainMesh {
  positions: Float32Array
  edges: Uint32Array
  faces: Uint32Array          // surface triangles (outer shell + cerebellum) for raycasting/sculpt
  regionOf: Int8Array
  adjacency: number[][]
  centroid: Vec3
  vertexCount: number
  verticesByRegion: Record<Region, number[]>
  interiorVertices: number[]   // indices of the random interior-fill points (for routing through the volume)
  pathBetween: (a: number, b: number) => number[] | null
}

// ── deterministic value noise (no deps) ─────────────────────────────────────────
function hash3(x: number, y: number, z: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 1274126177
  h = (h ^ (h >>> 13)) >>> 0
  h = (h * 1274126177) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967295
}
const fade = (t: number) => t * t * (3 - 2 * t)
function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = x - xi, yf = y - yi, zf = z - zi
  const u = fade(xf), v = fade(yf), w = fade(zf)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi)
  const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi)
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1)
  const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1)
  return lerp(
    lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
    lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
    w,
  )
}
// Deterministic PRNG (mulberry32) for the interior fill — fixed seed → same lattice every build.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

const DEG = Math.PI / 180
const rotX = (v: Vec3, a: number): Vec3 => { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c] }
const rotY = (v: Vec3, a: number): Vec3 => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c] }
const rotZ = (v: Vec3, a: number): Vec3 => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]] }

// Rotate point p (XYZ-euler degrees) around center c. `inverse` undoes it — used by the sculpt
// raycaster to map a clicked surface point on the rotated cerebrum back to its base direction.
export function rotateAround(p: Vec3, deg: Vec3, c: Vec3, inverse = false): Vec3 {
  const rx = deg[0] * DEG, ry = deg[1] * DEG, rz = deg[2] * DEG
  let v: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]
  if (!inverse) { v = rotX(v, rx); v = rotY(v, ry); v = rotZ(v, rz) }
  else { v = rotZ(v, -rz); v = rotY(v, -ry); v = rotX(v, -rx) }
  return [v[0] + c[0], v[1] + c[1], v[2] + c[2]]
}

// ── icosphere (shared-vertex subdivision) ───────────────────────────────────────
interface RawSphere { verts: Vec3[]; faces: [number, number, number][] }

function icosahedron(): RawSphere {
  const t = (1 + Math.sqrt(5)) / 2
  const verts: Vec3[] = ([
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ] as Vec3[]).map(normalize)
  const faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  return { verts, faces }
}

function icosphere(detail: number): RawSphere {
  const { verts, faces: f0 } = icosahedron()
  let faces = f0
  for (let i = 0; i < detail; i++) {
    const mid = new Map<string, number>()
    const getMid = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      const found = mid.get(key)
      if (found !== undefined) return found
      const va = verts[a], vb = verts[b]
      const m = normalize([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2])
      const idx = verts.length
      verts.push(m); mid.set(key, idx)
      return idx
    }
    const next: [number, number, number][] = []
    for (const [a, b, c] of faces) {
      const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a)
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    faces = next
  }
  return { verts, faces }
}

// Cerebrum topology with LOCAL adaptive subdivision near density points (extra detail in a spot),
// plus a FRACTIONAL global `detail`: e.g. 3.5 subdivides a deterministic ~half of the level-3 faces
// one extra level, so total vertex count ramps smoothly instead of quadrupling per integer level.
function cerebrumTopology(detail: number, density: DensityPoint[], maxExtra = 2): RawSphere {
  const baseLevel = Math.max(0, Math.floor(detail))
  const frac = detail - baseLevel
  const base = icosphere(baseLevel)
  const verts = base.verts.slice()
  const mid = new Map<string, number>()
  const getMid = (a: number, b: number): number => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`
    const found = mid.get(key)
    if (found !== undefined) return found
    const va = verts[a], vb = verts[b]
    const m = normalize([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2])
    const idx = verts.length
    verts.push(m); mid.set(key, idx)
    return idx
  }
  const dnorm = density.map((d) => ({ n: normalize([d.x, d.y, d.z]), radius: d.radius, level: d.level }))
  const extraFor = (a: number, b: number, c: number): number => {
    const va = verts[a], vb = verts[b], vc = verts[c]
    const cen = normalize([(va[0] + vb[0] + vc[0]) / 3, (va[1] + vb[1] + vc[1]) / 3, (va[2] + vb[2] + vc[2]) / 3])
    // Fractional global detail: deterministically subdivide a `frac` share of faces one extra level.
    let lvl = frac > 0.001 && hash3(Math.round(cen[0] * 997), Math.round(cen[1] * 997), Math.round(cen[2] * 997)) < frac ? 1 : 0
    for (const d of dnorm) {
      const ang = Math.acos(clamp(cen[0] * d.n[0] + cen[1] * d.n[1] + cen[2] * d.n[2], -1, 1))
      if (ang < d.radius) lvl = Math.max(lvl, Math.round(d.level * (1 - ang / d.radius)))
    }
    return Math.min(lvl, maxExtra)
  }
  const out: [number, number, number][] = []
  const subdiv = (face: [number, number, number], level: number) => {
    if (level <= 0) { out.push(face); return }
    const [a, b, c] = face
    const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a)
    subdiv([a, ab, ca], level - 1); subdiv([b, bc, ab], level - 1)
    subdiv([c, ca, bc], level - 1); subdiv([ab, bc, ca], level - 1)
  }
  for (const face of base.faces) subdiv(face, extraFor(face[0], face[1], face[2]))
  return { verts, faces: out }
}

// ── shaping: unit direction → cerebrum vertex position ──────────────────────────
interface NormBulge { n: Vec3; radius: number; strength: number }

function cerebrumVertex(dir: Vec3, p: BrainShapeParams, bulges: NormBulge[]): Vec3 {
  const [dx, dy, dz] = dir
  let x = dx * p.ax, y = dy * p.ay, z = dz * p.az

  const n = (valueNoise(dx * p.noiseFreq + 11, dy * p.noiseFreq + 4, dz * p.noiseFreq + 7) - 0.5) * p.noiseAmp
  const temporal = p.temporalBulge *
    smoothstep(-0.05, -0.55, dy) * smoothstep(0.35, 0.75, Math.abs(dx)) * smoothstep(-0.45, 0.4, dz)

  // Control-point bulges (lobe presets + click-sculpt): gaussian over the surface direction.
  let bulge = 0
  for (const b of bulges) {
    const ang = Math.acos(clamp(dx * b.n[0] + dy * b.n[1] + dz * b.n[2], -1, 1))
    bulge += b.strength * Math.exp(-((ang / b.radius) ** 2))
  }

  const s = 1 + n + temporal + bulge
  x *= s; y *= s; z *= s

  // Rounder above than below: dome the crown, taper + flatten the base.
  y += p.topDome * smoothstep(0.0, 1.0, dy)
  const taper = 1 - p.bottomTaper * smoothstep(0.0, -1.0, dy)
  x *= taper; z *= taper
  if (dy < 0) y *= 1 - p.bottomFlatten
  const baseY = -p.ay * 0.5
  if (y < baseY) y = baseY + (y - baseY) * (1 - p.baseFlatten)

  // Longitudinal fissure.
  const fissure = p.fissureDepth * Math.exp(-((dx / p.fissureWidth) ** 2)) * smoothstep(-0.05, 0.65, dy)
  y -= fissure
  x += Math.sign(dx) * p.hemisphereSpread * Math.exp(-((dx / (p.fissureWidth * 1.5)) ** 2)) * smoothstep(0.0, 0.7, dy)

  return [x, y, z]
}

function regionForCerebrum(dir: Vec3): Region {
  const [dx, dy, dz] = dir
  if (dy < -0.18 && Math.abs(dx) > 0.42 && dz > -0.25) return 'temporal'
  if (dz > 0.42) return 'frontal'
  if (dz < -0.4) return 'occipital'
  return 'parietal'
}

// Lobe sliders → control points, merged with the user's custom click-sculpt points.
function effectiveBulges(p: BrainShapeParams): NormBulge[] {
  const out: NormBulge[] = (p.bulges ?? []).map((b) => ({ n: normalize([b.x, b.y, b.z]), radius: b.radius, strength: b.strength }))
  for (const lobe of ['frontal', 'parietal', 'temporal', 'occipital'] as Lobe[]) {
    const scale = p.lobes?.[lobe]?.scale ?? 1
    if (Math.abs(scale - 1) > 0.001) {
      for (const c of LOBE_CENTERS[lobe]) out.push({ n: normalize(c), radius: LOBE_RADIUS, strength: (scale - 1) * LOBE_BULGE_GAIN })
    }
  }
  return out
}
function effectiveDensity(p: BrainShapeParams): DensityPoint[] {
  const out: DensityPoint[] = [...(p.densityPoints ?? [])]
  for (const lobe of ['frontal', 'parietal', 'temporal', 'occipital'] as Lobe[]) {
    const d = p.lobes?.[lobe]?.density ?? 0
    if (d > 0) for (const c of LOBE_CENTERS[lobe]) { const n = normalize(c); out.push({ x: n[0], y: n[1], z: n[2], radius: LOBE_RADIUS, level: d }) }
  }
  return out
}

// ── assembly ────────────────────────────────────────────────────────────────────
export function buildBrainMesh(params: BrainShapeParams = DEFAULT_BRAIN_PARAMS): BrainMesh {
  const positions: number[] = []
  const regionOf: number[] = []
  const edgeSet = new Set<number>()
  const edgePairs: [number, number][] = []
  const surfaceFaces: number[] = []
  let vCount = 0

  const pushVertex = (px: number, py: number, pz: number, region: Region): number => {
    const idx = vCount++
    positions.push(px, py, pz)
    regionOf.push(REGION_CODE[region])
    return idx
  }
  const addEdge = (a: number, b: number) => {
    if (a === b) return
    const lo = Math.min(a, b), hi = Math.max(a, b)
    const key = lo * 1000000 + hi
    if (edgeSet.has(key)) return
    edgeSet.add(key); edgePairs.push([lo, hi])
  }
  const addFaceEdges = (faces: [number, number, number][], offset: number) => {
    for (const [a, b, c] of faces) {
      addEdge(a + offset, b + offset); addEdge(b + offset, c + offset); addEdge(c + offset, a + offset)
    }
  }

  const cy = params.centerY
  const bulges = effectiveBulges(params)
  const density = effectiveDensity(params)

  // Cerebrum topology (with local density) → deformed positions → concentric shells.
  const topo = cerebrumTopology(params.detail, density)
  const outerPos: Vec3[] = topo.verts.map((d) => cerebrumVertex(d, params, bulges))
  const shells = params.shells?.length ? params.shells : [1]
  const shellIndex: number[][] = []
  for (const scale of shells) {
    const idxMap: number[] = []
    const off = vCount
    for (let i = 0; i < outerPos.length; i++) {
      const o = outerPos[i]
      idxMap.push(pushVertex(o[0] * scale, cy + (o[1] - cy) * scale, o[2] * scale, regionForCerebrum(topo.verts[i])))
    }
    addFaceEdges(topo.faces, off)
    shellIndex.push(idxMap)
  }
  for (let s = 0; s < shellIndex.length - 1; s++) {
    for (let i = 0; i < outerPos.length; i++) addEdge(shellIndex[s][i], shellIndex[s + 1][i])
  }
  const cerebrumIndex = shellIndex[0]
  const outerOff = shellIndex[0][0]
  for (const [a, b, c] of topo.faces) surfaceFaces.push(a + outerOff, b + outerOff, c + outerOff)

  // Interior fill: random vertices through the cerebrum volume + short edges to nearest neighbours.
  // The volume is star-shaped from C, so a random direction → its surface point S gives a ray, and
  // a cube-root radius spreads points uniformly along it. Region-tagged like the surface, so notes
  // can be pinned inside too. Deterministic (seeded RNG); edges capped to maxEdge so none stretch
  // across the brain (nearest-neighbour fallback keeps stray points from floating unconnected).
  const interiorVertices: number[] = []
  const fill = params.interior
  if (fill && fill.fillDensity > 0) {
    const rng = mulberry32(0x1a2b3c4d)
    const C: Vec3 = [0, cy, 0]
    const nInterior = Math.round(outerPos.length * fill.fillDensity)
    const intPos: Vec3[] = []
    for (let i = 0; i < nInterior; i++) {
      const u = rng() * 2 - 1, theta = rng() * Math.PI * 2, sq = Math.sqrt(1 - u * u)
      const dir: Vec3 = [sq * Math.cos(theta), u, sq * Math.sin(theta)]
      const surf = cerebrumVertex(dir, params, bulges)
      const r = Math.cbrt(rng()) * fill.margin
      const p: Vec3 = [C[0] + (surf[0] - C[0]) * r, C[1] + (surf[1] - C[1]) * r, C[2] + (surf[2] - C[2]) * r]
      interiorVertices.push(pushVertex(p[0], p[1], p[2], regionForCerebrum(dir)))
      intPos.push(p)
    }
    // Candidates each interior point may link to: the outer shell + the other interior points.
    const candIdx = [...cerebrumIndex, ...interiorVertices]
    const candPos = [...outerPos, ...intPos]
    const maxE2 = fill.maxEdge * fill.maxEdge
    for (let i = 0; i < interiorVertices.length; i++) {
      const pi = intPos[i]
      const near: { idx: number; d2: number }[] = []
      let bestIdx = -1, bestD2 = Infinity
      for (let j = 0; j < candIdx.length; j++) {
        if (candIdx[j] === interiorVertices[i]) continue
        const pj = candPos[j]
        const d2 = (pi[0] - pj[0]) ** 2 + (pi[1] - pj[1]) ** 2 + (pi[2] - pj[2]) ** 2
        if (d2 < bestD2) { bestD2 = d2; bestIdx = candIdx[j] }
        if (d2 <= maxE2) near.push({ idx: candIdx[j], d2 })
      }
      near.sort((a, b) => a.d2 - b.d2)
      const k = Math.min(fill.neighbors, near.length)
      for (let n = 0; n < k; n++) addEdge(interiorVertices[i], near[n].idx)
      if (k === 0 && bestIdx >= 0) addEdge(interiorVertices[i], bestIdx) // never leave a point orphaned
    }
  }

  // Cerebellum: small, lumpy, tucked back-and-down.
  const cb = icosphere(params.cerebellum.detail)
  const cbOff = vCount
  const { scale: cbS, center: cbC, wrinkleAmp, wrinkleFreq } = params.cerebellum
  const cbIndex: number[] = []
  for (const dir of cb.verts) {
    const wrinkle = (valueNoise(dir[0] * wrinkleFreq + 30, dir[1] * wrinkleFreq, dir[2] * wrinkleFreq) - 0.5) * wrinkleAmp
    cbIndex.push(pushVertex(
      cbC[0] + dir[0] * cbS[0] * (1 + wrinkle),
      cbC[1] + dir[1] * cbS[1] * (1 + wrinkle),
      cbC[2] + dir[2] * cbS[2] * (1 + wrinkle),
      'cerebellum',
    ))
  }
  addFaceEdges(cb.faces, cbOff)
  for (const [a, b, c] of cb.faces) surfaceFaces.push(a + cbOff, b + cbOff, c + cbOff)

  // Brain stem: a few short strands of points.
  const { points: nStem, top: sTop, bottom: sBot, strands, spread } = params.stem
  const stemIndex: number[] = []
  for (let st = 0; st < strands; st++) {
    const ang = (st / Math.max(1, strands)) * Math.PI * 2
    const ox = Math.cos(ang) * spread, oz = Math.sin(ang) * spread
    let prev = -1
    for (let i = 0; i < nStem; i++) {
      const t = i / Math.max(1, nStem - 1)
      const idx = pushVertex(
        sTop[0] + (sBot[0] - sTop[0]) * t + ox * (1 - t * 0.3),
        sTop[1] + (sBot[1] - sTop[1]) * t,
        sTop[2] + (sBot[2] - sTop[2]) * t + oz * (1 - t * 0.3),
        'stem',
      )
      if (prev !== -1) addEdge(prev, idx)
      prev = idx
      if (st === 0) stemIndex.push(idx)
    }
  }

  const posArr = new Float32Array(positions)

  // Bake the cerebrum-only rotation: rotate just the cerebrum vertices (region < 4) around the
  // shape center; cerebellum + stem stay put. Done before bridges so they reconnect to the new
  // positions, and before adjacency/centroid so everything downstream is consistent.
  const rot = params.rotation ?? [0, 0, 0]
  if (rot[0] || rot[1] || rot[2]) {
    const S: Vec3 = [0, cy, 0]
    for (let i = 0; i < vCount; i++) {
      if (regionOf[i] >= REGION_CODE.cerebellum) continue
      const r = rotateAround([posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]], rot, S)
      posArr[i * 3] = r[0]; posArr[i * 3 + 1] = r[1]; posArr[i * 3 + 2] = r[2]
    }
  }

  const dist2 = (i: number, j: number) =>
    (posArr[i * 3] - posArr[j * 3]) ** 2 + (posArr[i * 3 + 1] - posArr[j * 3 + 1]) ** 2 + (posArr[i * 3 + 2] - posArr[j * 3 + 2]) ** 2
  const nearestIn = (target: number, pool: number[]): number => {
    let best = pool[0], bestD = Infinity
    for (const j of pool) { const d = dist2(target, j); if (d < bestD) { bestD = d; best = j } }
    return best
  }

  for (const v of cbIndex) {
    if (posArr[v * 3 + 1] > cbC[1] + 0.16) addEdge(v, nearestIn(v, cerebrumIndex))
  }
  if (stemIndex.length) {
    addEdge(stemIndex[0], nearestIn(stemIndex[0], cerebrumIndex))
    addEdge(stemIndex[Math.floor(stemIndex.length / 2)], nearestIn(stemIndex[Math.floor(stemIndex.length / 2)], cbIndex))
  }

  const adjacency: number[][] = Array.from({ length: vCount }, () => [])
  for (const [a, b] of edgePairs) { adjacency[a].push(b); adjacency[b].push(a) }

  const verticesByRegion: Record<Region, number[]> = {
    frontal: [], parietal: [], temporal: [], occipital: [], cerebellum: [], stem: [],
  }
  for (let i = 0; i < vCount; i++) verticesByRegion[REGIONS[regionOf[i]]].push(i)

  let sx = 0, sy = 0, sz = 0
  for (let i = 0; i < vCount; i++) { sx += posArr[i * 3]; sy += posArr[i * 3 + 1]; sz += posArr[i * 3 + 2] }
  const centroid: Vec3 = [sx / vCount, sy / vCount, sz / vCount]

  // Shortest path weighted by EUCLIDEAN edge length (Dijkstra), not hop count. This lets a relation
  // dive straight through the interior fill when that's geometrically shorter than skimming the
  // densely-triangulated surface — far-apart notes cross the volume, near ones hug the surface.
  // (A hop-count BFS always preferred the surface, since it has many more short edges.) Cached by
  // the unordered {a,b} pair; the returned path is reversed by callers when they need a fixed start.
  const pathCache = new Map<number, number[] | null>()
  const pathBetween = (a: number, b: number): number[] | null => {
    if (a === b) return [a]
    const key = Math.min(a, b) * vCount + Math.max(a, b)
    const cached = pathCache.get(key)
    if (cached !== undefined) return cached
    const dist = new Float64Array(vCount).fill(Infinity)
    const prev = new Int32Array(vCount).fill(-1)
    const done = new Uint8Array(vCount)
    dist[a] = 0
    // Binary min-heap of vertex ids keyed by dist[] (lazy deletion via the done[] guard).
    const heap: number[] = [a]
    const swap = (i: number, j: number) => { const t = heap[i]; heap[i] = heap[j]; heap[j] = t }
    const siftUp = (i: number) => { while (i > 0) { const p = (i - 1) >> 1; if (dist[heap[p]] <= dist[heap[i]]) break; swap(p, i); i = p } }
    const siftDown = (i: number) => {
      const n = heap.length
      for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < n && dist[heap[l]] < dist[heap[m]]) m = l; if (r < n && dist[heap[r]] < dist[heap[m]]) m = r; if (m === i) break; swap(m, i); i = m }
    }
    let found = false
    while (heap.length) {
      const cur = heap[0]
      const last = heap.pop()!
      if (heap.length) { heap[0] = last; siftDown(0) }
      if (done[cur]) continue
      done[cur] = 1
      if (cur === b) { found = true; break }
      const dcur = dist[cur]
      for (const nb of adjacency[cur]) {
        if (done[nb]) continue
        const nd = dcur + Math.sqrt(dist2(cur, nb))
        if (nd < dist[nb]) { dist[nb] = nd; prev[nb] = cur; heap.push(nb); siftUp(heap.length - 1) }
      }
    }
    let path: number[] | null = null
    if (found) {
      path = []
      for (let cur = b; cur !== -1; cur = prev[cur]) path.push(cur)
      path.reverse()
    }
    pathCache.set(key, path)
    return path
  }

  const edges = new Uint32Array(edgePairs.length * 2)
  for (let i = 0; i < edgePairs.length; i++) { edges[i * 2] = edgePairs[i][0]; edges[i * 2 + 1] = edgePairs[i][1] }

  return {
    positions: posArr, edges, faces: new Uint32Array(surfaceFaces), regionOf: new Int8Array(regionOf),
    adjacency, centroid, vertexCount: vCount, verticesByRegion, interiorVertices, pathBetween,
  }
}

// Fill any missing fields (older saved tuner states) from defaults so build never crashes.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeShape(s?: any): BrainShapeParams {
  const d = DEFAULT_BRAIN_PARAMS
  if (!s) return structuredClone(d)
  const lobe = (l: Lobe): LobeControl => ({ ...d.lobes[l], ...(s.lobes?.[l] ?? {}) })
  return {
    ...structuredClone(d), ...s,
    cerebellum: { ...d.cerebellum, ...(s.cerebellum ?? {}) },
    stem: { ...d.stem, ...(s.stem ?? {}) },
    interior: { ...d.interior, ...(s.interior ?? {}) },
    lobes: { frontal: lobe('frontal'), parietal: lobe('parietal'), temporal: lobe('temporal'), occipital: lobe('occipital') },
    bulges: Array.isArray(s.bulges) ? s.bulges : [],
    densityPoints: Array.isArray(s.densityPoints) ? s.densityPoints : [],
    shells: Array.isArray(s.shells) && s.shells.length ? s.shells : [...d.shells],
    rotation: Array.isArray(s.rotation) && s.rotation.length === 3 ? s.rotation : [...d.rotation],
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Adaptive scaffold density: the wireframe should feel sparse with a handful of notes and grow
// denser as the graph fills up — instead of always rendering the full hand-tuned lattice. The
// cerebrum is an icosphere whose vertex count is V(d) ≈ 10·4^d + 2; we pick the `detail` that
// yields ~VERTS_PER_NODE free vertices per graph node (room for clustering + path routing without
// nodes spilling out of their region), then clamp to a range that still reads as a brain.
//
// Tune here: lower VERTS_PER_NODE / DETAIL_MIN for an even sparser look, raise for denser.
const VERTS_PER_NODE = 5
const DETAIL_MIN = 1.6
const DETAIL_MAX = 3.3
export function adaptiveDetail(nodeCount: number): number {
  const target = Math.max(40, nodeCount * VERTS_PER_NODE)
  // Invert V(d) = 10·4^d + 2  →  d = log4((target − 2) / 10).
  const d = Math.log((target - 2) / 10) / Math.log(4)
  const clamped = Math.max(DETAIL_MIN, Math.min(DETAIL_MAX, d))
  return Math.round(clamped * 10) / 10 // 0.1 steps → stable, avoids micro-rebuilds
}

// Built once with defaults, reused across opens/sessions.
let cached: BrainMesh | null = null
export function getBrainMesh(): BrainMesh {
  if (!cached) cached = buildBrainMesh()
  return cached
}
