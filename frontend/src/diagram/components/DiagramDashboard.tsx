import { useDiagramStore } from '../store'
import { GitBranch, Download, Trash2, Plus, Database, Upload } from 'lucide-react'
import type { Connection } from '@/types/database'

interface DiagramDashboardProps {
  onOpen: (id: string) => void
  onNewBlank: () => void
  onNewFromSchema: () => void
  onImport: () => void
  isConnected: boolean
  activeConnection: Connection | null
  connections: Connection[]
}

export function DiagramDashboard({ onOpen, onNewBlank, onNewFromSchema, onImport, isConnected, activeConnection, connections }: DiagramDashboardProps) {
  const diagrams = useDiagramStore((s) => s.diagrams)
  const deleteDiagram = useDiagramStore((s) => s.deleteDiagram)
  const exportToJson = useDiagramStore((s) => s.exportToJson)

  // Filter diagrams by active connection, plus always show blank diagrams (no sourceConnectionId)
  const filteredDiagrams = diagrams.filter((d) => {
    if (!d.sourceConnectionId) return true // blank/offline diagrams always visible
    if (activeConnection) return d.sourceConnectionId === activeConnection.id
    return false
  })

  const connMap = new Map(connections.map((c) => [c.id, c]))

  const handleExport = (id: string) => {
    const json = exportToJson(id)
    if (!json) return
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const diagram = diagrams.find((d) => d.id === id)
    a.download = `${diagram?.name ?? 'diagram'}.tokdiagram`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full flex flex-col p-6 gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Diagrams</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage your database schema diagrams.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onImport}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import
          </button>
          {isConnected && (
            <button
              onClick={onNewFromSchema}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
            >
              <Database className="w-3.5 h-3.5" />
              New from Schema
            </button>
          )}
          <button
            onClick={onNewBlank}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Blank
          </button>
        </div>
      </div>

      {!activeConnection ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center">
            <GitBranch className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Select a connection</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              Choose a connection from the sidebar and double-click a schema to start creating diagrams.
            </p>
          </div>
        </div>
      ) : filteredDiagrams.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center">
            <Database className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">No diagrams for this connection</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              Create a diagram from the schema of "{activeConnection.name}" or start a blank one.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Group by connection */}
          {Array.from(
            new Set(filteredDiagrams.map((d) => d.sourceConnectionId ?? '__blank__'))
          ).map((connId) => {
            const groupDiagrams = filteredDiagrams.filter((d) => (d.sourceConnectionId ?? '__blank__') === connId)
            const connName = connId === '__blank__' ? 'Offline' : connMap.get(connId)?.name ?? connId
            return (
              <div key={connId}>
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                  {connId === '__blank__' ? (
                    <GitBranch className="w-3.5 h-3.5" />
                  ) : (
                    <Database className="w-3.5 h-3.5" />
                  )}
                  {connName}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupDiagrams.map((diagram) => (
                    <div
                      key={diagram.id}
                      className="group relative bg-card border border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer"
                      onClick={() => onOpen(diagram.id)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                            <GitBranch className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm leading-tight">{diagram.name}</h4>
                            {diagram.sourceSchema && (
                              <span className="text-[10px] text-muted-foreground">
                                Schema: {diagram.sourceSchema}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>{diagram.nodes.length} node{diagram.nodes.length !== 1 ? 's' : ''}</span>
                        <span>{diagram.edges.length} edge{diagram.edges.length !== 1 ? 's' : ''}</span>
                      </div>

                      <div className="text-[10px] text-muted-foreground mt-1">
                        {new Date(diagram.updatedAt).toLocaleDateString()}
                      </div>

                      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExport(diagram.id) }}
                          className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                          title="Export"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteDiagram(diagram.id) }}
                          className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
