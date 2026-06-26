import { useEffect, useRef } from 'react'
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  type Simulation,
} from 'd3-force'
import type { BrainGraphModel, BrainNode } from './useBrainGraph'

// d3-force augments node objects in place with position/velocity.
export interface SimNode extends BrainNode {
  x?: number; y?: number; vx?: number; vy?: number
  fx?: number | null; fy?: number | null
  radius: number
}

interface SimLink { source: SimNode | string; target: SimNode | string; score?: number }

export function nodeRadius(kind: BrainNode['kind']): number {
  return kind === 'group' ? 15 : kind === 'folder' ? 10 : kind === 'section' ? 4 : 6.5
}

/**
 * Owns a d3-force simulation but keeps its internal timer stopped — BrainCanvas drives it via
 * `simulation.tick()` inside its own rAF loop, so panning/zooming keeps redrawing even after the
 * layout settles. Two link forces: structure (firm, short) and content (weak, scaled by
 * similarity) so semantically-close notes drift together. Node positions survive model rebuilds.
 */
export function useForceLayout(model: BrainGraphModel, width: number, height: number) {
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const sizeRef = useRef({ width, height })
  useEffect(() => { sizeRef.current = { width, height } }, [width, height])

  useEffect(() => {
    const prev = new Map(nodesRef.current.map((n) => [n.id, n]))
    const nodes: SimNode[] = model.nodes.map((n) => {
      const p = prev.get(n.id)
      return { ...n, radius: nodeRadius(n.kind), x: p?.x, y: p?.y, vx: p?.vx, vy: p?.vy }
    })
    nodesRef.current = nodes
    const byId = new Map(nodes.map((n) => [n.id, n]))

    const structureLinks: SimLink[] = model.structureEdges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }))
    const contentLinks: SimLink[] = [
      ...model.contentEdges.map((e) => ({ source: e.source, target: e.target, score: e.score })),
      // User relations pull related sections together too (top strength, like a strong content edge).
      ...model.relationEdges.map((e) => ({ source: e.source, target: e.target, score: 1 })),
    ].filter((e) => byId.has(e.source) && byId.has(e.target))

    const { width: w, height: h } = sizeRef.current
    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force('structure', forceLink<SimNode, SimLink>(structureLinks)
        .id((d) => d.id).distance(72).strength(0.75))
      .force('content', forceLink<SimNode, SimLink>(contentLinks)
        .id((d) => d.id).distance(170).strength((l) => 0.04 + 0.22 * (l.score ?? 0)))
      .force('charge', forceManyBody<SimNode>().strength((d) => (d.kind === 'group' ? -520 : -240)))
      .force('center', forceCenter(w / 2, h / 2))
      .force('collide', forceCollide<SimNode>().radius((d) => d.radius + 7))
      .alpha(1).alphaDecay(0.03)
    sim.stop()
    simRef.current = sim
    return () => { sim.stop() }
  }, [model])

  // Keep the centering force at the viewport center without rebuilding the simulation.
  useEffect(() => {
    const center = simRef.current?.force('center') as ReturnType<typeof forceCenter> | undefined
    center?.x(width / 2).y(height / 2)
  }, [width, height])

  const reheat = (alpha = 0.6) => { simRef.current?.alpha(alpha) }

  return { simRef, nodesRef, reheat }
}

export type { SimLink }
