import { useState } from 'react'
import { X, Loader2, Database, Eye, EyeOff, ChevronDown, ChevronRight, Columns, ListChecks, Search } from 'lucide-react'
import { schemaService } from '@/services/schema.service'
import { ColumnMapper } from '@/components/sync/ColumnMapper'
import type { SyncTableConfig, ColumnMapping } from '@/types/sync'

interface Step2TablesProps {
  sourceId: string
  targetId: string
  sourceSchema: string
  targetSchema: string
  tables: SyncTableConfig[]
  onTablesChange: (tables: SyncTableConfig[]) => void
  sourceColumns: Record<number, string[]>
  onSourceColumnsChange: (cols: Record<number, string[]>) => void
}

export function Step2Tables({
  sourceId,
  targetId,
  sourceSchema,
  targetSchema,
  tables,
  onTablesChange,
  sourceColumns,
  onSourceColumnsChange,
}: Step2TablesProps) {
  const [loadingColumns, setLoadingColumns] = useState<Record<number, boolean>>({})
  const [targetColumns, setTargetColumns] = useState<Record<number, string[]>>({})
  const [loadingTargetColumns, setLoadingTargetColumns] = useState<Record<number, boolean>>({})
  const [previewData, setPreviewData] = useState<Record<number, string[][]>>({})
  const [loadingPreview, setLoadingPreview] = useState<Record<number, boolean>>({})
  const [showPreview, setShowPreview] = useState<Record<number, boolean>>({})
  const [advancedOpen, setAdvancedOpen] = useState<Record<number, boolean>>({})
  const [loadingAllTables, setLoadingAllTables] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const addTable = () => {
    onTablesChange([...tables, { source_table: '', target_table: '', column_mappings: [] }])
  }

  const addAllTables = async () => {
    if (!sourceId || !sourceSchema) return
    setLoadingAllTables(true)
    try {
      const sourceTables = await schemaService.getTables(sourceId, sourceSchema)
      const existingNames = new Set(tables.map((t) => t.source_table))
      const newTables: SyncTableConfig[] = []
      const newColumns: Record<number, string[]> = {}

      const tablesToFetch = sourceTables.filter((t) => !existingNames.has(t.name))

      const CHUNK_SIZE = 5
      for (let ci = 0; ci < tablesToFetch.length; ci += CHUNK_SIZE) {
        const chunk = tablesToFetch.slice(ci, ci + CHUNK_SIZE)
        const results = await Promise.allSettled(
          chunk.map((t) => schemaService.getColumns(sourceId, t.name, sourceSchema))
        )
        for (let ri = 0; ri < results.length; ri++) {
          const tableName = chunk[ri].name
          const globalIdx = tables.length + newTables.length
          const result = results[ri]
          if (result.status === 'fulfilled') {
            const colNames = result.value.map((c) => c.name)
            newColumns[globalIdx] = colNames
            newTables.push({
              source_table: tableName,
              target_table: tableName,
              column_mappings: colNames.map((name) => ({
                source_column: name,
                destination_column: name,
              })),
            })
          } else {
            newTables.push({
              source_table: tableName,
              target_table: tableName,
              column_mappings: [],
            })
          }
        }
      }

      if (newTables.length > 0) {
        onTablesChange([...tables, ...newTables])
        onSourceColumnsChange({ ...sourceColumns, ...newColumns })
      }
    } catch {

    } finally {
      setLoadingAllTables(false)
    }
  }

  const updateTable = (i: number, field: keyof SyncTableConfig, value: unknown) => {
    const newTables = tables.map((t, j) => j === i ? { ...t, [field]: value } as SyncTableConfig : t)
    onTablesChange(newTables)

    if (field === 'source_table' && sourceId && sourceSchema && value) {
      const tableName = value as string
      setLoadingColumns((prev) => ({ ...prev, [i]: true }))
      schemaService.getColumns(sourceId, tableName, sourceSchema)
        .then((cols) => {
          const colNames = cols.map((c) => c.name)
          onSourceColumnsChange({ ...sourceColumns, [i]: colNames })
          const mappings: ColumnMapping[] = colNames.map((name) => ({
            source_column: name,
            destination_column: name,
          }))
          const updatedTables = newTables.map((t, j) =>
            j === i ? { ...t, column_mappings: mappings } : t
          )
          onTablesChange(updatedTables)
        })
        .catch(() => {})
        .finally(() => {
          setLoadingColumns((prev) => ({ ...prev, [i]: false }))
        })
    }

    if (field === 'target_table' && targetId && targetSchema && value) {
      setLoadingTargetColumns((prev) => ({ ...prev, [i]: true }))
      schemaService.getColumns(targetId, value as string, targetSchema)
        .then((cols) => {
          setTargetColumns((prev) => ({ ...prev, [i]: cols.map((c) => c.name) }))
        })
        .catch(() => {})
        .finally(() => {
          setLoadingTargetColumns((prev) => ({ ...prev, [i]: false }))
        })
    }
  }

  const removeTable = (i: number) => {
    onTablesChange(tables.filter((_, j) => j !== i))
  }

  const loadPreview = async (i: number) => {
    const table = tables[i]
    if (!sourceId || !sourceSchema || !table.source_table) return
    setLoadingPreview((prev) => ({ ...prev, [i]: true }))
    try {
      const result = await schemaService.getPreview(sourceId, table.source_table, 5)
      setPreviewData((prev) => ({ ...prev, [i]: result.rows }))
      setShowPreview((prev) => ({ ...prev, [i]: true }))
    } catch {

    } finally {
      setLoadingPreview((prev) => ({ ...prev, [i]: false }))
    }
  }

  const updateMappings = (i: number, mappings: ColumnMapping[]) => {
    const newTables = tables.map((t, j) =>
      j === i ? { ...t, column_mappings: mappings } as SyncTableConfig : t
    )
    onTablesChange(newTables)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground">
          Tables to sync
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={addAllTables}
            disabled={!sourceId || !sourceSchema || loadingAllTables}
            className="flex items-center gap-1 text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingAllTables ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ListChecks className="w-3 h-3" />
            )}
            Copy all tables
          </button>
          <button
            onClick={addTable}
            className="flex items-center gap-1 text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
          >
            <Database className="w-3 h-3" /> Add Table
          </button>
        </div>
      </div>


      {tables.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="w-full bg-background border border-border pl-8 pr-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tables..."
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}


      {tables
        .filter((table) =>
          !searchQuery ||
          table.source_table.toLowerCase().includes(searchQuery.toLowerCase()) ||
          table.target_table.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .map((table) => {
          const i = tables.indexOf(table)
          return (
            <div key={i} className="border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Table {i + 1}</span>
                <button onClick={() => removeTable(i)} className="p-1 text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Source Table</label>
                  <input
                    className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                    value={table.source_table}
                    onChange={(e) => updateTable(i, 'source_table', e.target.value)}
                    placeholder="table_name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Target Table</label>
                  <input
                    className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                    value={table.target_table}
                    onChange={(e) => updateTable(i, 'target_table', e.target.value)}
                    placeholder="table_name"
                  />
                </div>
              </div>

              {loadingColumns[i] ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Detecting columns...
                </div>
              ) : sourceColumns[i] && sourceColumns[i].length > 0 ? (
                <div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Database className="w-3 h-3" />
                    {sourceColumns[i].length} columns detected
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (showPreview[i]) {
                          setShowPreview((prev) => ({ ...prev, [i]: false }))
                        } else {
                          loadPreview(i)
                        }
                      }}
                      className="flex items-center gap-1 text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-primary hover:text-primary/80"
                    >
                      {showPreview[i] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showPreview[i] ? 'Hide preview' : 'Show preview'}
                    </button>
                    {loadingPreview[i] && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  </div>

                  {showPreview[i] && previewData[i] && (
                    <div className="mt-2 border border-border bg-background overflow-x-auto">
                      <table className="w-full text-[var(--ch-text-10)] font-mono">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            {sourceColumns[i].slice(0, 5).map((col) => (
                              <th key={col} className="px-2 py-1 text-left font-bold text-muted-foreground">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData[i].map((row, ri) => (
                            <tr key={ri} className="border-b border-border/50">
                              {row.slice(0, 5).map((cell, ci) => (
                                <td key={ci} className="px-2 py-1 truncate max-w-[150px]">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}


              <div className="border border-dashed border-border/50">
                <button
                  onClick={() => setAdvancedOpen((prev) => ({ ...prev, [i]: !prev[i] }))}
                  className="flex items-center gap-2 w-full px-3 py-2 text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  {advancedOpen[i] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <Columns className="w-3 h-3" />
                  Advanced options (column mapping, transformations)
                </button>
                {advancedOpen[i] && (
                  <div className="px-3 pb-3 space-y-4">
                    <div className="space-y-1">
                      <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Filter (SQL WHERE clause)</label>
                      <input
                        className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                        value={table.filters ?? ''}
                        onChange={(e) => updateTable(i, 'filters', e.target.value || undefined)}
                        placeholder="e.g. created_at > '2024-01-01'"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Primary key(s)</label>
                      {loadingTargetColumns[i] ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" /> Loading target columns...
                        </div>
                      ) : (
                        <input
                          className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                          value={table.primary_key?.join(', ') ?? ''}
                          onChange={(e) => updateTable(i, 'primary_key', e.target.value ? e.target.value.split(',').map((s) => s.trim()) : undefined)}
                          placeholder="Auto-detected if left empty"
                        />
                      )}
                    </div>
                    <ColumnMapper
                      sourceColumns={sourceColumns[i] ?? []}
                      targetColumns={targetColumns[i] ?? []}
                      mappings={table.column_mappings}
                      onChange={(mappings) => updateMappings(i, mappings)}
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}

      {tables.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border">
          No tables configured. Click "Add Table" or "Copy all tables".
        </p>
      )}

      {tables.length > 0 && tables.filter((table) =>
        !searchQuery ||
        table.source_table.toLowerCase().includes(searchQuery.toLowerCase()) ||
        table.target_table.toLowerCase().includes(searchQuery.toLowerCase())
      ).length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border">
          No tables matched "{searchQuery}"
        </p>
      )}
    </div>
  )
}
