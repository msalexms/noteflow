// Vertex occupation: pins each graph node (group / folder / note / section) onto a free vertex of
// the brain mesh, deterministically, so opening the brain always lays notes out the same way.
//
// Rules:
//  · Grouped (coloured) nodes live ONLY on the cerebrum lobes — never the cerebellum or stem —
//    spread round-robin across the lobes; ungrouped notes → parietal.
//  · Ungrouped favorited notes → cerebellum (these are the colourless ring nodes).
//  · Within a region: a seed vertex, then nearest free vertices by BFS over the mesh → a cluster.
//  · Sections (dendrites) sit on a free mesh-neighbour of their parent note, confined to the same
//    area (cerebrum vs cerebellum) as the note.
//
// Greedy nearest-free over a shrinking free-set, constrained to an allowed region-set so coloured
// nodes never spill onto the cerebellum/stem. Output: Map<nodeId, vertexIndex>.

import { REGION_CODE, type BrainMesh, type Region } from './brainMesh'
import type { BrainGraphModel } from './useBrainGraph'

const GROUP_LOBES: Region[] = ['frontal', 'temporal', 'occipital']
const CEREBRUM = new Set<number>([REGION_CODE.frontal, REGION_CODE.parietal, REGION_CODE.temporal, REGION_CODE.occipital])
const CEREBELLUM = new Set<number>([REGION_CODE.cerebellum])

export function assignVertices(mesh: BrainMesh, model: BrainGraphModel): Map<string, number> {
  const assignment = new Map<string, number>()
  const free = new Set<number>()
  for (let i = 0; i < mesh.vertexCount; i++) free.add(i)
  const pos = mesh.positions
  const claimed: number[] = []
  const claim = (id: string, v: number) => { assignment.set(id, v); free.delete(v); claimed.push(v) }

  const dist2 = (a: number, b: number) =>
    (pos[a * 3] - pos[b * 3]) ** 2 + (pos[a * 3 + 1] - pos[b * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[b * 3 + 2]) ** 2
  const anyFreeIn = (allowed: Set<number>): number => {
    for (const v of free) if (allowed.has(mesh.regionOf[v])) return v
    return -1
  }

  // Pick a free vertex in `region`, spread out from already-claimed vertices.
  const seedInRegion = (region: Region, allowed: Set<number>): number => {
    const verts = mesh.verticesByRegion[region]
    if (!claimed.length) { for (const v of verts) if (free.has(v)) return v }
    let best = -1, bestScore = -Infinity
    for (const v of verts) {
      if (!free.has(v)) continue
      let nd = Infinity
      for (const c of claimed) { const d = dist2(v, c); if (d < nd) nd = d }
      if (nd > bestScore) { bestScore = nd; best = v }
    }
    return best >= 0 ? best : anyFreeIn(allowed)
  }

  // Nearest free vertex to `start` via BFS, preferring a region match, confined to `allowed`.
  const nearestFree = (start: number, region: Region, allowed: Set<number>): number => {
    if (start < 0) return anyFreeIn(allowed)
    const want = REGION_CODE[region]
    const seen = new Uint8Array(mesh.vertexCount)
    const q = [start]; seen[start] = 1
    let head = 0, fallback = -1
    while (head < q.length) {
      const cur = q[head++]
      if (free.has(cur) && allowed.has(mesh.regionOf[cur])) {
        if (mesh.regionOf[cur] === want) return cur
        if (fallback < 0) fallback = cur
      }
      for (const nb of mesh.adjacency[cur]) if (!seen[nb]) { seen[nb] = 1; q.push(nb) }
    }
    return fallback >= 0 ? fallback : anyFreeIn(allowed)
  }
  const freeNeighbor = (v: number, allowed: Set<number>): number => {
    for (const nb of mesh.adjacency[v]) if (free.has(nb) && allowed.has(mesh.regionOf[nb])) return nb
    return -1
  }

  const parentOf = new Map<string, string>()
  for (const e of model.structureEdges) parentOf.set(e.target, e.source)

  const regionByNode = new Map<string, Region>()
  const anchorOf = new Map<string, number>()
  const allowedOf = new Map<string, Set<number>>()
  let lobeIdx = 0

  // model.nodes is in stable sidebar order, parents before children, so a single pass works.
  for (const node of model.nodes) {
    if (node.kind === 'group') {
      const region = GROUP_LOBES[lobeIdx++ % GROUP_LOBES.length]
      const v = seedInRegion(region, CEREBRUM)
      if (v >= 0) { claim(node.id, v); anchorOf.set(node.id, v) }
      regionByNode.set(node.id, region); allowedOf.set(node.id, CEREBRUM)
    } else if (node.kind === 'folder') {
      const pg = parentOf.get(node.id)
      const region = (pg !== undefined ? regionByNode.get(pg) : undefined) || 'parietal'
      const pa = pg !== undefined ? anchorOf.get(pg) : undefined
      const v = nearestFree(pa ?? seedInRegion(region, CEREBRUM), region, CEREBRUM)
      if (v >= 0) { claim(node.id, v); anchorOf.set(node.id, v) }
      regionByNode.set(node.id, region); allowedOf.set(node.id, CEREBRUM)
    } else if (node.kind === 'note') {
      const coloured = node.colorVar !== '--text'
      let region: Region, anchor: number, allowed: Set<number>
      if (coloured) {
        // grouped → always its group's cerebrum lobe
        const p = parentOf.get(node.id)
        region = (p !== undefined ? regionByNode.get(p) : undefined) || 'parietal'
        anchor = (p !== undefined ? anchorOf.get(p) : undefined) ?? seedInRegion(region, CEREBRUM)
        allowed = CEREBRUM
      } else if (node.favorited) {
        region = 'cerebellum'; anchor = seedInRegion(region, CEREBELLUM); allowed = CEREBELLUM
      } else {
        region = 'parietal'; anchor = seedInRegion(region, CEREBRUM); allowed = CEREBRUM
      }
      const v = nearestFree(anchor, region, allowed)
      if (v >= 0) { claim(node.id, v); anchorOf.set(node.id, v) }
      regionByNode.set(node.id, region); allowedOf.set(node.id, allowed)
    } else { // section → free neighbour of its parent note, same area as the note
      const noteNodeId = `n:${node.noteId}`
      const noteV = anchorOf.get(noteNodeId)
      if (noteV == null) continue
      const allowed = allowedOf.get(noteNodeId) ?? CEREBRUM
      let v = freeNeighbor(noteV, allowed)
      if (v < 0) v = nearestFree(noteV, regionByNode.get(noteNodeId) ?? 'parietal', allowed)
      if (v >= 0) claim(node.id, v)
    }
  }

  return assignment
}
