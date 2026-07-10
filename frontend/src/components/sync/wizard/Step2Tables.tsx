import { useState } from 'react'
import { X, Loader2, Database, Eye, EyeOff, ChevronDown, ChevronRight, Columns } from 'lucide-react'
import { schemaService } from '@/services/schema.service'
import { ColumnMapper } from '@/components/sync/ColumnMapper'
import { Tooltip } from '@/components/ui/Tooltip'
import type { SyncTableConfig, ColumnMapping } from '@/types/sync'

interface Step2TablesProps {
  sourceId: string
  targetId: string
  tables: SyncTableConfig[]
  onTablesChange: (tables: SyncTableConfig[]) => void
  sourceColumns: Record<number, string[]>
  onSourceColumnsChange: (cols: Record<number, string[]>) => void
}

export function Step2Tables({
  sourceId,
  targetId,
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

  const addTable = () => {
    onTablesChange([...tables, { source_table: '', target_table: '', column_mappings: [] }])
  }

  const updateTable = (i: number, field: keyof SyncTableConfig, value: unknown) => {
    const newTables = tables.map((t, j) => j === i ? { ...t, [field]: value } as SyncTableConfig : t)
    onTablesChange(newTables)

    if (field === 'source_table' && sourceId && value) {
      const tableName = value as string
      setLoadingColumns((prev) => ({ ...prev, [i]: true }))
      schemaService.getColumns(sourceId, tableName)
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

    if (field === 'target_table' && targetId && value) {
      setLoadingTargetColumns((prev) => ({ ...prev, [i]: true }))
      schemaService.getColumns(targetId, value as string)
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
    if (!sourceId || !table.source_table) return
    setLoadingPreview((prev) => ({ ...prev, [i]: true }))
    try {
      const result = await schemaService.getPreview(sourceId, table.source_table, 5)
      setPreviewData((prev) => ({ ...prev, [i]: result.rows }))
      setShowPreview((prev) => ({ ...prev, [i]: true }))
    } catch {
      // ignore
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
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Tablas a sincronizar
        </span>
        <button
          onClick={addTable}
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
        >
          <Database className="w-3 h-3" /> Agregar Tabla
        </button>
      </div>

      {tables.map((table, i) => (
        <div key={i} className="border border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">Tabla {i + 1}</span>
            <button onClick={() => removeTable(i)} className="p-1 text-muted-foreground hover:text-destructive">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Tabla Origen</label>
              <input
                className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                value={table.source_table}
                onChange={(e) => updateTable(i, 'source_table', e.target.value)}
                placeholder="nombre_tabla"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Tabla Destino</label>
              <input
                className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                value={table.target_table}
                onChange={(e) => updateTable(i, 'target_table', e.target.value)}
                placeholder="nombre_tabla"
              />
            </div>
          </div>

          {loadingColumns[i] ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Detectando columnas...
            </div>
          ) : sourceColumns[i] && sourceColumns[i].length > 0 ? (
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Database className="w-3 h-3" />
                {sourceColumns[i].length} columnas detectadas
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
                  className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-primary hover:text-primary/80"
                >
                  {showPreview[i] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showPreview[i] ? 'Ocultar preview' : 'Ver preview'}
                </button>
                {loadingPreview[i] && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </div>

              {showPreview[i] && previewData[i] && (
                <div className="mt-2 border border-border bg-background overflow-x-auto">
                  <table className="w-full text-[10px] font-mono">
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

          {/* Advanced: column mappings, transforms */}
          <div className="border border-dashed border-border/50">
            <button
              onClick={() => setAdvancedOpen((prev) => ({ ...prev, [i]: !prev[i] }))}
              className="flex items-center gap-2 w-full px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              {advancedOpen[i] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Columns className="w-3 h-3" />
              Opciones avanzadas (mapeo de columnas, transformaciones)
            </button>
            {advancedOpen[i] && (
              <div className="px-3 pb-3 space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Filtro (cláusula SQL WHERE)</label>
                  <input
                    className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                    value={table.filters ?? ''}
                    onChange={(e) => updateTable(i, 'filters', e.target.value || undefined)}
                    placeholder="ej: created_at > '2024-01-01'"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Llave(s) primaria(s)</label>
                  {loadingTargetColumns[i] ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" /> Cargando columnas destino...
                    </div>
                  ) : (
                    <input
                      className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                      value={table.primary_key?.join(', ') ?? ''}
                      onChange={(e) => updateTable(i, 'primary_key', e.target.value ? e.target.value.split(',').map((s) => s.trim()) : undefined)}
                      placeholder="Auto-detectado si se deja vacío"
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
      ))}

      {tables.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border">
          No hay tablas configuradas. Haz clic en "Agregar Tabla".
        </p>
      )}
    </div>
  )
}
