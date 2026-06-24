import { useCallback, useState, useRef, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TableNode } from './nodes/TableNode'
import { ViewNode } from './nodes/ViewNode'
import { CardinalityEdge } from './edges/CardinalityEdge'
import type { EdgeCardinality } from '@/types/database'

interface DiagramCanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onEdgeCreate: (edge: Edge) => void
  onEdgeDataChange: (edgeId: string, data: Record<string, unknown>) => void
  onEdgeDelete: (edgeId: string) => void
  emptyMessage?: string
}

const nodeTypes: NodeTypes = {
  table: TableNode,
  view: ViewNode,
}

const edgeTypes: EdgeTypes = {
  cardinality: CardinalityEdge,
}

const CARDINALITY_OPTIONS: EdgeCardinality[] = ['1:1', '1:N', 'N:M']

export function DiagramCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onEdgeCreate,
  onEdgeDataChange,
  onEdgeDelete,
  emptyMessage = 'No objects in this diagram.',
}: DiagramCanvasProps) {
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [cardinalityPicker, setCardinalityPicker] = useState<{
    source: string
    target: string
    position: { x: number; y: number }
  } | null>(null)
  const reactFlowRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cardinalityPicker) {
      const handler = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (!target.closest('[data-cardinality-picker]')) {
          setCardinalityPicker(null)
        }
      }
      setTimeout(() => document.addEventListener('mousedown', handler), 0)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [cardinalityPicker])

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return

      const existing = edges.find(
        (e) => e.source === connection.source && e.target === connection.target,
      )
      if (existing) return

      const rect = reactFlowRef.current?.getBoundingClientRect()
      let position = { x: 200, y: 200 }
      if (rect) {
        position = {
          x: rect.width / 2 - 80,
          y: rect.height / 2 - 40,
        }
      }

      setCardinalityPicker({
        source: connection.source,
        target: connection.target,
        position,
      })
    },
    [edges],
  )

  const confirmConnection = useCallback(
    (cardinality: EdgeCardinality) => {
      if (!cardinalityPicker) return
      const edgeId = `manual:${cardinalityPicker.source}:${cardinalityPicker.target}`
      const newEdge: Edge = {
        id: edgeId,
        source: cardinalityPicker.source,
        target: cardinalityPicker.target,
        type: 'cardinality',
        data: { cardinality, isManual: true },
      }
      onEdgeCreate(newEdge)
      setCardinalityPicker(null)
    },
    [cardinalityPicker, onEdgeCreate],
  )

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdge(edge.id)
    },
    [],
  )

  const onPaneClick = useCallback(() => {
    setSelectedEdge(null)
  }, [])

  const handleDeleteEdge = useCallback(() => {
    if (!selectedEdge) return
    onEdgeDelete(selectedEdge)
    setSelectedEdge(null)
  }, [selectedEdge, onEdgeDelete])

  const handleChangeCardinality = useCallback(
    (cardinality: EdgeCardinality) => {
      if (!selectedEdge) return
      onEdgeDataChange(selectedEdge, { cardinality })
      setSelectedEdge(null)
    },
    [selectedEdge, onEdgeDataChange],
  )

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      deleted.forEach((e) => onEdgeDelete(e.id))
      setSelectedEdge(null)
    },
    [onEdgeDelete],
  )

  return (
    <div className="w-full h-full relative" ref={containerRef}>
      {nodes.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          {emptyMessage}
        </div>
      ) : (
        <>
          <svg style={{ position: 'absolute', width: 0, height: 0 }}>
            <defs>
              <marker
                id="arrow-muted"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
              </marker>
              <marker
                id="arrow-primary"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--primary))" />
              </marker>
            </defs>
          </svg>

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2}
            attributionPosition="bottom-left"
            deleteKeyCode={['Backspace', 'Delete']}
            onEdgesDelete={onEdgesDelete}
            connectionLineStyle={{
              stroke: 'hsl(var(--muted-foreground))',
              strokeWidth: 2,
              strokeDasharray: '5 5',
            }}
            defaultEdgeOptions={{
              type: 'cardinality',
            }}
          >
            <Background />
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              className="!border !border-border"
            />
          </ReactFlow>
        </>
      )}

      {/* Edge context menu */}
      {selectedEdge &&
        (() => {
          const edge = edges.find((e) => e.id === selectedEdge)
          if (!edge) return null
          const currentCardinality = (edge.data?.cardinality as EdgeCardinality) ?? '1:N'
          const isManual = edge.data?.isManual as boolean
          return (
            <div
              className="absolute top-4 right-4 z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-[160px]"
              data-cardinality-picker
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                {isManual ? 'Manual Connection' : 'Foreign Key'}
              </div>
              <div className="text-xs text-muted-foreground mb-2 truncate max-w-[180px]">
                {edge.source.replace(/^table:/, '').replace(/^view:/, '')} →{' '}
                {edge.target.replace(/^table:/, '').replace(/^view:/, '')}
              </div>
              {edge.label && (
                <div className="text-[10px] text-muted-foreground mb-2 italic">
                  {edge.label}
                </div>
              )}
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Cardinality
              </div>
              <div className="flex gap-1 mb-2">
                {CARDINALITY_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleChangeCardinality(c)}
                    className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                      currentCardinality === c
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <button
                onClick={handleDeleteEdge}
                className="w-full text-[10px] font-bold uppercase tracking-wider text-destructive hover:bg-destructive/10 rounded py-1 transition-colors"
              >
                Delete
              </button>
            </div>
          )
        })()}

      {/* Cardinality picker popover for new connections */}
      {cardinalityPicker && (
        <div
          className="absolute z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-[160px]"
          data-cardinality-picker
          style={{
            left: cardinalityPicker.position.x,
            top: cardinalityPicker.position.y,
          }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            New Connection
          </div>
          <div className="text-xs text-muted-foreground mb-2 truncate max-w-[180px]">
            {cardinalityPicker.source.replace(/^table:/, '').replace(/^view:/, '')} →{' '}
            {cardinalityPicker.target.replace(/^table:/, '').replace(/^view:/, '')}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            Cardinality
          </div>
          <div className="flex gap-1 mb-2">
            {CARDINALITY_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => confirmConnection(c)}
                className="px-2 py-1 text-[10px] font-bold rounded bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                {c}
              </button>
            ))}
          </div>
          <button
            onClick={() => setCardinalityPicker(null)}
            className="w-full text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted rounded py-1 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
