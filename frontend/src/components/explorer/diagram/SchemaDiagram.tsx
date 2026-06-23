import { useMemo, useCallback, useState, useRef, useEffect } from 'react'
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
  useEdgesState,
  useNodesState,
  ReactFlowProvider,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TableNode } from './TableNode'
import { CardinalityEdge } from './CardinalityEdge'
import type { SchemaDiagramData, EdgeCardinality } from '@/types/database'

interface SchemaDiagramProps {
  data: SchemaDiagramData
}

const nodeTypes: NodeTypes = {
  table: TableNode,
}

const edgeTypes: EdgeTypes = {
  cardinality: CardinalityEdge,
}

const COL_WIDTH = 300
const ROW_HEIGHT = 250
const COLS = 4

const CARDINALITY_OPTIONS: EdgeCardinality[] = ['1:1', '1:N', 'N:M']

function Flow({ data }: SchemaDiagramProps) {
  const visibleTableNames = useMemo(
    () => new Set(data.tables.map((t) => t.name)),
    [data],
  )

  const initialNodes: Node[] = useMemo(() => {
    const nodes: Node[] = []
    let idx = 0

    for (const table of data.tables) {
      const col = idx % COLS
      const row = Math.floor(idx / COLS)
      nodes.push({
        id: `table:${table.name}`,
        type: 'table',
        position: { x: col * COL_WIDTH, y: row * ROW_HEIGHT },
        data: { label: table.name, columns: table.columns, foreignKeys: table.foreign_keys },
      })
      idx++
    }

    return nodes
  }, [data])

  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = []
    const added = new Set<string>()

    for (const table of data.tables) {
      for (const fk of table.foreign_keys) {
        if (!visibleTableNames.has(fk.referencedTable)) continue
        const edgeId = `fk:${table.name}:${fk.constraintName}`
        if (added.has(edgeId)) continue
        added.add(edgeId)
        edges.push({
          id: edgeId,
          source: `table:${fk.referencedTable}`,
          target: `table:${table.name}`,
          type: 'cardinality',
          data: { cardinality: '1:N' as EdgeCardinality, isManual: false },
          label: `${fk.columnName} → ${fk.referencedColumn}`,
        })
      }
    }

    return edges
  }, [data, visibleTableNames])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [cardinalityPicker, setCardinalityPicker] = useState<{
    source: string
    target: string
    position: { x: number; y: number }
  } | null>(null)
  const reactFlowRef = useRef<HTMLDivElement>(null)

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

      const sourceEl = document.querySelector(
        `[data-id="${connection.source}"]`,
      )
      const targetEl = document.querySelector(
        `[data-id="${connection.target}"]`,
      )
      const flowRect = reactFlowRef.current?.getBoundingClientRect()

      let position = { x: 200, y: 200 }
      if (flowRect) {
        position = {
          x: flowRect.width / 2 - 80,
          y: flowRect.height / 2 - 40,
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
      setEdges((eds) => [...eds, newEdge])
      setCardinalityPicker(null)
    },
    [cardinalityPicker, setEdges],
  )

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdge(edge.id)
    },
    [],
  )

  const deleteSelectedEdge = useCallback(() => {
    if (!selectedEdge) return
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdge))
    setSelectedEdge(null)
  }, [selectedEdge, setEdges])

  const changeCardinality = useCallback(
    (cardinality: EdgeCardinality) => {
      if (!selectedEdge) return
      setEdges((eds) =>
        eds.map((e) =>
          e.id === selectedEdge
            ? { ...e, data: { ...e.data, cardinality } }
            : e,
        ),
      )
      setSelectedEdge(null)
    },
    [selectedEdge, setEdges],
  )

  const onPaneClick = useCallback(() => {
    setSelectedEdge(null)
  }, [])

  return (
    <div className="w-full h-full relative" ref={reactFlowRef}>
      {nodes.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          No objects found in this schema.
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
            onEdgesDelete={(deleted) => {
              setSelectedEdge(null)
            }}
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
                {edge.source.replace('table:', '')} → {edge.target.replace('table:', '')}
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
                    onClick={() => changeCardinality(c)}
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
                onClick={deleteSelectedEdge}
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
            {cardinalityPicker.source.replace('table:', '')} →{' '}
            {cardinalityPicker.target.replace('table:', '')}
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

export function SchemaDiagram(props: SchemaDiagramProps) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  )
}
