import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react'
import { useAppStore } from '@/store/useAppStore'
import { schemaService } from '@/services/schema.service'
import { connectionService } from '@/services/connection.service'
import { invoke } from '@tauri-apps/api/core'
import {
  Plus, X, Table2, Loader2, GitBranch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FeatureGate } from '@/components/gamification/FeatureGate'
import { useDiagramStore } from './store'
import { DiagramDashboard } from './components/DiagramDashboard'
import { DiagramToolbar } from './components/DiagramToolbar'
import { DiagramCanvas } from './components/DiagramCanvas'
import { TableFormModal } from './components/TableFormModal'
import { ViewFormModal } from './components/ViewFormModal'
import { nodesToMermaid } from './lib/toMermaid'
import type { SchemaDiagramData, ColumnResponse, ForeignKeyResponse } from '@/types/database'
import { DIAGRAM_FILE_EXTENSION, DIAGRAM_FILE_FILTER } from './types'

const COL_WIDTH = 300
const ROW_HEIGHT = 250
const COLS = 4

function buildNodesFromSchema(data: SchemaDiagramData): Node[] {
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
}

function buildEdgesFromSchema(data: SchemaDiagramData): Edge[] {
  const edges: Edge[] = []
  const added = new Set<string>()
  const visibleNames = new Set(data.tables.map((t) => t.name))

  for (const table of data.tables) {
    for (const fk of table.foreign_keys) {
      if (!visibleNames.has(fk.referencedTable)) continue
      const edgeId = `fk:${table.name}:${fk.constraintName}`
      if (added.has(edgeId)) continue
      added.add(edgeId)
      edges.push({
        id: edgeId,
        source: `table:${fk.referencedTable}`,
        target: `table:${table.name}`,
        type: 'cardinality',
        data: { cardinality: '1:N', isManual: false },
        label: `${fk.columnName} → ${fk.referencedColumn}`,
      })
    }
  }
  return edges
}

function EditorInner() {
  const activeConnection = useAppStore((s) => s.activeConnection)
  const diagrams = useDiagramStore((s) => s.diagrams)
  const activeDiagramId = useDiagramStore((s) => s.activeDiagramId)
  const saveDiagram = useDiagramStore((s) => s.saveDiagram)
  const renameDiagram = useDiagramStore((s) => s.renameDiagram)
  const setActiveDiagram = useDiagramStore((s) => s.setActiveDiagram)
  const importFromJson = useDiagramStore((s) => s.importFromJson)
  const setDiagramSchema = useDiagramStore((s) => s.setDiagramSchema)

  const diagram = diagrams.find((d) => d.id === activeDiagramId)
  const hasConnection = !!diagram?.sourceConnectionId
  const isPostgres = activeConnection?.type === 'postgres'

  const [showTableSelector, setShowTableSelector] = useState(!diagram || (hasConnection && diagram.nodes.length === 0))
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set())
  const [tableFormOpen, setTableFormOpen] = useState(false)
  const [editingNode, setEditingNode] = useState<Node | null>(null)
  const [editingViewName, setEditingViewName] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [editorKey, setEditorKey] = useState(0)


  const { data: availableSchemas = [] } = useQuery({
    queryKey: ['schemas', diagram?.sourceConnectionId],
    queryFn: () => schemaService.getSchemas(diagram!.sourceConnectionId!),
    enabled: isPostgres && hasConnection,
    staleTime: 5 * 60 * 1000,
  })


  useEffect(() => {
    if (!diagram || !isPostgres || !availableSchemas.length) return
    if (!diagram.sourceSchema && availableSchemas.length > 0) {
      const defaultSchema = availableSchemas.includes('public') ? 'public' : availableSchemas[0]
      setDiagramSchema(diagram.id, defaultSchema)
      const t = setTimeout(() => setSelectedTables(new Set()), 0)
      return () => clearTimeout(t)
    }
  }, [diagram, isPostgres, availableSchemas, setDiagramSchema])

  const currentSchema = diagram?.sourceSchema || activeConnection?.database


  const { data: allTables = [], isLoading: isLoadingTables } = useQuery({
    queryKey: ['tables', diagram?.sourceConnectionId, currentSchema],
    queryFn: () => schemaService.getTables(diagram!.sourceConnectionId!, currentSchema),
    enabled: showTableSelector && hasConnection,
    staleTime: 5 * 60 * 1000,
  })

  const tableNames = useMemo(
    () => allTables.map((t: { name: string }) => t.name),
    [allTables],
  )


  const { data: diagramData, isLoading: isLoadingDiagram } = useQuery({
    queryKey: ['diagram', diagram?.sourceConnectionId, currentSchema, [...selectedTables].sort()],
    queryFn: () =>
      schemaService.getSchemaDiagramData(
        diagram!.sourceConnectionId!,
        currentSchema!,
        [...selectedTables],
      ),
    enabled: showTableSelector && !!diagram?.sourceConnectionId && !!currentSchema && selectedTables.size > 0,
    staleTime: 5 * 60 * 1000,
  })


  const initialNodes: Node[] = useMemo(() => {
    if (diagram && diagram.nodes.length > 0) return diagram.nodes
    if (diagramData && showTableSelector) return buildNodesFromSchema(diagramData)
    return []
  }, [diagram, diagramData, showTableSelector])

  const initialEdges: Edge[] = useMemo(() => {
    if (diagram && diagram.edges.length > 0) return diagram.edges
    if (diagramData && showTableSelector) return buildEdgesFromSchema(diagramData)
    return []
  }, [diagram, diagramData, showTableSelector])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)


  const mermaidCode = useMemo(() => nodesToMermaid(nodes, edges), [nodes, edges])


  useEffect(() => { setNodes(initialNodes) }, [initialNodes, setNodes])
  useEffect(() => { setEdges(initialEdges) }, [initialEdges, setEdges])


  const handleSave = useCallback(() => {
    if (!diagram) return
    setIsSaving(true)
    saveDiagram(diagram.id, nodes, edges)
    setTimeout(() => setIsSaving(false), 500)
  }, [diagram, nodes, edges, saveDiagram])

  const handleRename = useCallback((name: string) => {
    if (diagram) renameDiagram(diagram.id, name)
  }, [diagram, renameDiagram])

  const handleBack = useCallback(() => {
    handleSave()
    setActiveDiagram(null)
  }, [handleSave, setActiveDiagram])


  const toggleTable = useCallback((name: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const addAllTables = useCallback(() => {
    setSelectedTables(new Set(tableNames))
  }, [tableNames])

  const clearAllTables = useCallback(() => {
    setSelectedTables(new Set())
  }, [])


  const handleAddTable = useCallback((tableName: string, columns: ColumnResponse[], foreignKeys: ForeignKeyResponse[]) => {
    const editing = editingNode
    const newId = `table:${tableName}`

    setNodes((nds) => {
      const existingIndex = nds.findIndex((n) => n.id === newId)
      const newNode: Node = {
        id: newId,
        type: 'table',
        position: editing?.position ?? { x: 50 + nds.length * 30, y: 50 + nds.length * 30 },
        data: { label: tableName, columns, foreignKeys },
      }
      if (editing) {

        return nds.map((n) => (n.id === editing.id ? newNode : n))
      }
      if (existingIndex >= 0) return nds
      return [...nds, newNode]
    })


    if (editing && editing.id !== newId) {
      setEdges((eds) =>
        eds.map((e) =>
          e.source === editing.id
            ? { ...e, source: newId }
            : e.target === editing.id
              ? { ...e, target: newId }
              : e,
        ),
      )
    }

    setEditingNode(null)
    setTableFormOpen(false)
  }, [editingNode, setNodes, setEdges])

  const handleAddView = useCallback(() => {
    const viewName = `view_${nodes.length + 1}`
    const newId = `view:${viewName}`
    const offset = nodes.length * 30
    const newNode: Node = {
      id: newId,
      type: 'view',
      position: { x: 50 + offset, y: 50 + offset },
      data: { label: viewName },
    }
    setNodes((nds) => [...nds, newNode])
  }, [nodes, setNodes])


  const handleSaveView = useCallback((name: string, query?: string) => {
    if (!editingViewName) return
    const newId = `view:${name}`
    setNodes((nds) =>
      nds.map((n) =>
        n.id === editingViewName
          ? { ...n, id: newId, data: { ...n.data, label: name, query } }
          : n,
      ),
    )
    if (editingViewName !== newId) {
      setEdges((eds) =>
        eds.map((e) =>
          e.source === editingViewName
            ? { ...e, source: newId }
            : e.target === editingViewName
              ? { ...e, target: newId }
              : e,
        ),
      )
    }
    setEditingViewName(null)
  }, [editingViewName, setNodes, setEdges])


  const handleNodeEdit = useCallback((node: Node) => {
    if (node.type === 'table') {
      setEditingNode(node)
      setTableFormOpen(true)
    } else if (node.type === 'view') {
      setEditingViewName(node.id)
    }
  }, [])


  const handleEdgeCreate = useCallback((edge: Edge) => {
    setEdges((eds) => [...eds, edge])
  }, [setEdges])

  const handleEdgeDataChange = useCallback((edgeId: string, data: Record<string, unknown>) => {
    setEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, data: { ...e.data, ...data } } : e)))
  }, [setEdges])

  const handleEdgeDelete = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId))
  }, [setEdges])


  const handleExport = useCallback(async () => {
    if (!diagram) return

    saveDiagram(diagram.id, nodes, edges)
    const store = useDiagramStore.getState()
    const json = store.exportToJson(diagram.id)
    if (!json) return

    try {
      await invoke('save_file_dialog', {
        content: json,
        defaultFileName: `${diagram.name}${DIAGRAM_FILE_EXTENSION}`,
        filterName: DIAGRAM_FILE_FILTER,
        filterExt: DIAGRAM_FILE_EXTENSION.replace('.', ''),
      })
    } catch {

      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${diagram.name}${DIAGRAM_FILE_EXTENSION}`
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [diagram, nodes, edges, saveDiagram])


  const handleImport = useCallback(async () => {
    try {
      const content: string = await invoke('open_file_dialog', {
        filterName: DIAGRAM_FILE_FILTER,
        filterExt: DIAGRAM_FILE_EXTENSION.replace('.', ''),
      })
      if (!content) return
      const id = importFromJson(content)
      if (id) {
        setActiveDiagram(id)
        setEditorKey((k) => k + 1)
      }
    } catch {

      const input = document.createElement('input')
      input.type = 'file'
      input.accept = DIAGRAM_FILE_EXTENSION
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        const text = await file.text()
        const id = importFromJson(text)
        if (id) {
          setActiveDiagram(id)
          setEditorKey((k) => k + 1)
        }
      }
      input.click()
    }
  }, [importFromJson, setActiveDiagram])

  if (!diagram) return null

  return (
    <div className="flex flex-col h-full">
      <DiagramToolbar
        diagramName={diagram.name}
        mermaidCode={mermaidCode}
        onRename={handleRename}
        onAddTable={() => setTableFormOpen(true)}
        onAddView={handleAddView}
        onSave={handleSave}
        onExport={handleExport}
        onImport={handleImport}
        onBack={handleBack}
        isSaving={isSaving}
        hasConnection={hasConnection}
        showSchemaSidebar={showTableSelector}
        onToggleSchemaSidebar={() => setShowTableSelector((v) => !v)}
      />

      <div className="flex flex-1 overflow-hidden">
        {showTableSelector && hasConnection && (
          <div className="w-72 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <GitBranch className="w-3.5 h-3.5 text-primary" />
                  Tables
                </h3>
                <div className="flex items-center gap-1">
                  <button onClick={addAllTables} className="p-1 hover:bg-muted rounded text-muted-foreground" title="Add all tables">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={clearAllTables} className="p-1 hover:bg-muted rounded text-muted-foreground" title="Clear all">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {currentSchema && (
                isPostgres && availableSchemas.length > 0 ? (
                  <select
                    className="w-full text-[var(--ch-text-10)] uppercase tracking-wider text-muted-foreground bg-transparent border border-border rounded px-2 py-1 focus:border-primary focus:outline-none"
                    value={currentSchema}
                    onChange={(e) => {
                      const newSchema = e.target.value
                      if (diagram) {
                        setDiagramSchema(diagram.id, newSchema)
                        setSelectedTables(new Set())
                      }
                    }}
                  >
                    {availableSchemas.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-[var(--ch-text-10)] text-muted-foreground uppercase tracking-wider truncate">
                    Schema: {currentSchema}
                  </div>
                )
              )}
            </div>

            <div className="flex-1 overflow-auto p-2">
              {isLoadingTables ? (
                <div className="space-y-2 p-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : tableNames.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                  No tables found.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {tableNames.map((name) => (
                    <button
                      key={name}
                      onClick={() => toggleTable(name)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors text-left",
                        selectedTables.has(name)
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted text-muted-foreground",
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                        selectedTables.has(name)
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}>
                        {selectedTables.has(name) && (
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <Table2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate flex-1">{name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedTables.size > 0 && (
              <div className="p-3 border-t border-border bg-muted/20">
                <div className="text-[var(--ch-text-10)] font-bold text-muted-foreground uppercase tracking-wider">
                  {selectedTables.size} table{selectedTables.size !== 1 ? 's' : ''} selected
                </div>
              </div>
            )}
          </div>
        )}


        <div className="flex-1 relative">
          {showTableSelector && hasConnection ? (
            selectedTables.size === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-12">
                <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                  <GitBranch className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium">Schema Diagram</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Select tables from the left panel to visualize their structure and relationships.
                </p>
              </div>
            ) : isLoadingDiagram ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DiagramCanvas
                key={editorKey}
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onEdgeCreate={handleEdgeCreate}
                onEdgeDataChange={handleEdgeDataChange}
                onEdgeDelete={handleEdgeDelete}
                onNodeEdit={handleNodeEdit}
              />
            )
          ) : (
            <DiagramCanvas
              key={editorKey}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onEdgeCreate={handleEdgeCreate}
              onEdgeDataChange={handleEdgeDataChange}
              onEdgeDelete={handleEdgeDelete}
              onNodeEdit={handleNodeEdit}
              emptyMessage="Add tables to start designing your diagram."
            />
          )}
        </div>
      </div>

      <TableFormModal
        key={editingNode?.id ?? 'new-table'}
        isOpen={tableFormOpen}
        onClose={() => { setTableFormOpen(false); setEditingNode(null) }}
        onSave={handleAddTable}
        initialName={(editingNode?.data as { label?: string } | undefined)?.label ?? ''}
        initialColumns={(editingNode?.data as { columns?: ColumnResponse[] } | undefined)?.columns}
        initialForeignKeys={(editingNode?.data as { foreignKeys?: ForeignKeyResponse[] } | undefined)?.foreignKeys}
      />
      {editingViewName && (() => {
        const node = nodes.find((n) => n.id === editingViewName)
        const data = node?.data as { label?: string; query?: string } | undefined
        return (
          <ViewFormModal
            key={editingViewName}
            initialName={data?.label ?? ''}
            initialQuery={data?.query ?? ''}
            onClose={() => setEditingViewName(null)}
            onSave={handleSaveView}
          />
        )
      })()}
    </div>
  )
}

function DiagramPageInner() {
  const activeConnection = useAppStore((s) => s.activeConnection)
  const activeDiagramId = useDiagramStore((s) => s.activeDiagramId)
  const loaded = useDiagramStore((s) => s.loaded)
  const loadDiagrams = useDiagramStore((s) => s.loadDiagrams)
  const createDiagram = useDiagramStore((s) => s.createDiagram)
  const setActiveDiagram = useDiagramStore((s) => s.setActiveDiagram)
  const importFromJson = useDiagramStore((s) => s.importFromJson)

  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
    staleTime: 5 * 60 * 1000,
  })

  const [editorKey, setEditorKey] = useState(0)


  useEffect(() => {
    if (!loaded) loadDiagrams()
  }, [loaded, loadDiagrams])

  const handleOpen = useCallback((id: string) => {
    setActiveDiagram(id)
    setEditorKey((k) => k + 1)
  }, [setActiveDiagram])

  const handleNewBlank = useCallback(() => {
    const id = createDiagram('Untitled Diagram')
    setActiveDiagram(id)
    setEditorKey((k) => k + 1)
  }, [createDiagram, setActiveDiagram])

  const handleNewFromSchema = useCallback(async () => {
    if (!activeConnection) return

    let schema: string | undefined
    if (activeConnection.type === 'postgres') {
      try {
        const schemas = await schemaService.getSchemas(activeConnection.id)
        schema = schemas.includes('public') ? 'public' : schemas[0]
      } catch {
        schema = 'public'
      }
    } else {
      schema = activeConnection.database
    }
    const id = createDiagram(`${activeConnection.name} Schema`, activeConnection.id, schema)
    setActiveDiagram(id)
    setEditorKey((k) => k + 1)
  }, [activeConnection, createDiagram, setActiveDiagram])

  const handleImport = useCallback(async () => {
    try {
      const content: string = await invoke('open_file_dialog', {
        filterName: DIAGRAM_FILE_FILTER,
        filterExt: DIAGRAM_FILE_EXTENSION.replace('.', ''),
      })
      if (!content) return
      const id = importFromJson(content)
      if (id) {
        setActiveDiagram(id)
        setEditorKey((k) => k + 1)
      }
    } catch {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = DIAGRAM_FILE_EXTENSION
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        const text = await file.text()
        const id = importFromJson(text)
        if (id) {
          setActiveDiagram(id)
          setEditorKey((k) => k + 1)
        }
      }
      input.click()
    }
  }, [importFromJson, setActiveDiagram])


  if (!activeDiagramId) {
    return (
      <DiagramDashboard
        onOpen={handleOpen}
        onNewBlank={handleNewBlank}
        onNewFromSchema={handleNewFromSchema}
        onImport={handleImport}
        isConnected={!!activeConnection}
        activeConnection={activeConnection}
        connections={connections}
      />
    )
  }
  return (
    <ReactFlowProvider>
      <EditorInner key={editorKey} />
    </ReactFlowProvider>
  )
}

export default function DiagramPage() {
  return (
    <FeatureGate perkId="schema_diagram">
      <DiagramPageInner />
    </FeatureGate>
  )
}
