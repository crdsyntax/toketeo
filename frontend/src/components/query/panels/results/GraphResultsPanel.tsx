import { useMemo } from 'react'
import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { graphResultToFlow, nodeDisplayLabel } from '@/lib/graph/graphModel'
import type { GraphResult } from '@/types/database'

interface GraphResultsPanelProps {
  graph: GraphResult
}

function GraphNodeView({ id, data }: { id: string; data: { labels: string[]; properties: Record<string, unknown> } }) {
  const label = nodeDisplayLabel(data.labels, id)
  return (
    <div className="px-3 py-2 rounded-full border border-primary/40 bg-card shadow-md text-xs font-medium select-none">
      {label}
    </div>
  )
}

const nodeTypes = { graph: GraphNodeView }

export function GraphResultsPanel({ graph }: GraphResultsPanelProps) {
  const { nodes, edges } = useMemo(() => graphResultToFlow(graph), [graph])

  if (nodes.length === 0 && edges.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 select-none">
        <span className="text-xs italic">Query returned no graph data</span>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 min-w-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.15}
        maxZoom={2.5}
        nodesConnectable={false}
        nodesDraggable={true}
        elementsSelectable={true}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          animated: true,
          labelStyle: { fontSize: 10, fill: 'var(--ch-text-10)' },
        }}
      >
        <Background gap={24} size={1.5} />
        <Controls />
        <MiniMap pannable zoomable nodeStrokeWidth={3} className="!bg-card" />
      </ReactFlow>
    </div>
  )
}
