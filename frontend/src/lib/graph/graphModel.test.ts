import { describe, it, expect } from 'vitest'
import type { GraphResult } from '@/types/database'
import { graphResultToFlow, nodeDisplayLabel } from './graphModel'

const sampleGraph: GraphResult = {
  nodes: [
    { id: '1', labels: ['Person'], properties: { name: 'alice' } },
    { id: '2', labels: ['Person'], properties: { name: 'bob' } },
    { id: '3', labels: ['Company'], properties: { name: 'acme' } },
  ],
  relationships: [
    { id: '10', type: 'KNOWS', source: '1', target: '2', properties: { since: 2020 } },
    { id: '11', type: 'WORKS_AT', source: '2', target: '3', properties: {} },
  ],
  paths: [],
}

describe('graphResultToFlow', () => {
  it('maps every node with position and graph type', () => {
    const { nodes } = graphResultToFlow(sampleGraph)
    expect(nodes).toHaveLength(3)
    for (const node of nodes) {
      expect(node.type).toBe('graph')
      expect(node.position).toBeDefined()
    }
  })

  it('maps relationships to edges with typed source/target', () => {
    const { edges } = graphResultToFlow(sampleGraph)
    expect(edges).toHaveLength(2)
    expect(edges[0]).toMatchObject({ source: '1', target: '2', data: { type: 'KNOWS' } })
    expect(edges[1]).toMatchObject({ source: '2', target: '3', data: { type: 'WORKS_AT' } })
  })

  it('flattens paths and deduplicates shared nodes and edges', () => {
    const graph: GraphResult = {
      nodes: [],
      relationships: [],
      paths: [
        {
          nodes: [
            { id: 'a', labels: ['A'], properties: {} },
            { id: 'b', labels: ['B'], properties: {} },
          ],
          relationships: [{ id: 'r1', type: 'TO', source: 'a', target: 'b', properties: {} }],
        },
        {
          nodes: [
            { id: 'b', labels: ['B'], properties: {} },
            { id: 'c', labels: ['C'], properties: {} },
          ],
          relationships: [{ id: 'r2', type: 'TO', source: 'b', target: 'c', properties: {} }],
        },
      ],
    }
    const { nodes, edges } = graphResultToFlow(graph)
    expect(nodes).toHaveLength(3)
    expect(edges).toHaveLength(2)
  })

  it('does not duplicate the same edge between the same endpoints', () => {
    const graph: GraphResult = {
      nodes: [
        { id: '1', labels: ['A'], properties: {} },
        { id: '2', labels: ['B'], properties: {} },
      ],
      relationships: [
        { id: 'x', type: 'TO', source: '1', target: '2', properties: {} },
        { id: 'y', type: 'TO', source: '1', target: '2', properties: {} },
      ],
      paths: [],
    }
    const { edges } = graphResultToFlow(graph)
    expect(edges).toHaveLength(1)
  })

  it('handles an empty graph', () => {
    const { nodes, edges } = graphResultToFlow({ nodes: [], relationships: [], paths: [] })
    expect(nodes).toHaveLength(0)
    expect(edges).toHaveLength(0)
  })
})

describe('nodeDisplayLabel', () => {
  it('uses the first label when present', () => {
    expect(nodeDisplayLabel(['Person'], '7')).toBe('Person')
  })

  it('falls back to the node id', () => {
    expect(nodeDisplayLabel([], '7')).toBe('node 7')
  })
})
