import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { schemaService } from '@/services/schema.service'
import { AlertCircle, Plus, X, Table2, Loader2, GitBranch } from 'lucide-react'
import { SchemaDiagram } from '@/components/explorer/diagram/SchemaDiagram'
import { cn } from '@/lib/utils'

export default function DiagramPage() {
  const { activeConnection } = useAppStore()
  const navigate = useNavigate()
  const currentSchema = activeConnection?.database

  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set())

  const { data: allTables = [], isLoading: isLoadingTables } = useQuery({
    queryKey: ['tables', activeConnection?.id, currentSchema],
    queryFn: () => schemaService.getTables(activeConnection!.id, currentSchema),
    enabled: !!activeConnection,
    staleTime: 5 * 60 * 1000,
  })

  const tableNames = useMemo(
    () => allTables.map((t: { name: string }) => t.name),
    [allTables],
  )

  const { data: diagramData, isLoading: isLoadingDiagram } = useQuery({
    queryKey: ['diagram', activeConnection?.id, currentSchema, [...selectedTables].sort()],
    queryFn: () =>
      schemaService.getSchemaDiagramData(
        activeConnection!.id,
        currentSchema!,
        [...selectedTables],
      ),
    enabled: !!activeConnection && !!currentSchema && selectedTables.size > 0,
    staleTime: 5 * 60 * 1000,
  })

  const toggleTable = (name: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const addAll = () => {
    setSelectedTables(new Set(tableNames))
  }

  const clearAll = () => {
    setSelectedTables(new Set())
  }

  if (!activeConnection) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-bold">No Connection Active</h2>
          <p className="text-muted-foreground">Select a connection first to view diagrams.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full gap-4">
      {/* Table Selector Panel */}
      <div className="w-72 shrink-0 border border-border rounded-xl bg-card flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-primary" />
              Tables
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={addAll}
                className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Add all tables"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={clearAll}
                className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Clear all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {currentSchema && (
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">
              Schema: {currentSchema}
            </div>
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
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      selectedTables.has(name)
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30",
                    )}
                  >
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
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {selectedTables.size} table{selectedTables.size !== 1 ? 's' : ''} selected
            </div>
          </div>
        )}
      </div>

      {/* Diagram Panel */}
      <div className="flex-1 border border-border rounded-xl bg-card flex flex-col overflow-hidden">
        {selectedTables.size === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
              <GitBranch className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">Schema Diagram</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Select tables from the left panel to visualize their structure and relationships.
            </p>
          </div>
        ) : isLoadingDiagram ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : diagramData ? (
          <SchemaDiagram data={diagramData} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            No diagram data available.
          </div>
        )}
      </div>
    </div>
  )
}
