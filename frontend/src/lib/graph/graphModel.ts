import type { Edge, Node } from '@xyflow/react'
import type { GraphResult } from '@/types/database'

export interface GraphLayoutNodeData {
  labels: string[]
  properties: Record<string, unknown>
  [key: string]: unknown
}

export type GraphLayoutNode = Node<GraphLayoutNodeData, 'graph'>
export type GraphLayoutEdge = Edge<{ type: string }>

/** Deduplica por id y aplana paths para obtener el conjunto completo de nodos/aristas. */
function collectNodes(graph: GraphResult): Map<string, GraphLayoutNode> {
  const map = new Map<string, GraphLayoutNode>()
  const add = (id: string, labels: string[], properties: Record<string, unknown>) => {
    if (!map.has(id)) {
      map.set(id, {
        id,
        type: 'graph',
        position: { x: 0, y: 0 },
        data: { labels, properties },
      })
    }
  }
  for (const node of graph.nodes) add(node.id, node.labels, node.properties)
  for (const path of graph.paths) {
    for (const node of path.nodes) add(node.id, node.labels, node.properties)
  }
  return map
}

function collectEdges(graph: GraphResult): GraphLayoutEdge[] {
  const seen = new Set<string>()
  const edges: GraphLayoutEdge[] = []
  const add = (id: string, type: string, source: string, target: string) => {
    const key = `${source}->${type}->${target}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({
      id: `r-${id}`,
      source,
      target,
      type: 'graph',
      data: { type },
    })
  }
  for (const rel of graph.relationships) add(rel.id, rel.type, rel.source, rel.target)
  for (const path of graph.paths) {
    for (const rel of path.relationships) add(rel.id, rel.type, rel.source, rel.target)
  }
  return edges
}

function circularPositions(
  ids: string[],
  radius: number,
  center = 320,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  ids.forEach((id, i) => {
    const angle = (i / Math.max(ids.length, 1)) * Math.PI * 2 - Math.PI / 2
    positions.set(id, {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    })
  })
  return positions
}

/** Convierte un GraphResult neutral en nodos/aristas de React Flow con layout circular. */
export function graphResultToFlow(graph: GraphResult): { nodes: GraphLayoutNode[]; edges: GraphLayoutEdge[] } {
  const nodes = collectNodes(graph)
  const edges = collectEdges(graph)

  const ids = [...nodes.keys()]
  const radius = Math.max(120, Math.min(420, ids.length * 45))
  const positions = circularPositions(ids, radius)

  for (const [id, node] of nodes) {
    const pos = positions.get(id)
    if (pos) node.position = pos
  }

  return { nodes: [...nodes.values()], edges }
}

/** Label de display para un nodo: primera label o fallback al id. */
export function nodeDisplayLabel(labels: string[], id: string): string {
  return labels.length > 0 ? labels[0] : `node ${id}`
}
