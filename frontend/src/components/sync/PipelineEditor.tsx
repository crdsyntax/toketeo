import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitBranch, X, Loader2, Database, Save, FlaskConical, ChevronDown, ChevronRight, Columns, ListChecks } from 'lucide-react'
import { connectionService } from '@/services/connection.service'
import { schemaService } from '@/services/schema.service'
import { useSyncStore } from '@/store/syncStore'
import { ColumnMapper } from '@/components/sync/ColumnMapper'
import { Tooltip } from '@/components/ui/Tooltip'
import type { Connection } from '@/types/database'
import type { SyncPipeline, SyncTableConfig, ColumnMapping, CreateSyncPipelineDto } from '@/types/sync'
import { SyncMode } from '@/types/sync'

interface PipelineEditorProps {
  pipeline?: SyncPipeline | null
  onClose: () => void
}

export function PipelineEditor({ pipeline, onClose }: PipelineEditorProps) {
  const savePipeline = useSyncStore((s) => s.savePipeline)
  const validatePipeline = useSyncStore((s) => s.validatePipeline)
  const validation = useSyncStore((s) => s.validation)

  const [name, setName] = useState(pipeline?.name ?? '')
  const [sourceId, setSourceId] = useState(pipeline?.source_connection_id ?? '')
  const [targetId, setTargetId] = useState(pipeline?.target_connection_id ?? '')
  const [mode, setMode] = useState<SyncMode>(pipeline?.mode ?? SyncMode.Full)
  const [tables, setTables] = useState<SyncTableConfig[]>(pipeline?.tables ?? [])
  const [sourceSchema, setSourceSchema] = useState(pipeline?.source_schema ?? '')
  const [targetSchema, setTargetSchema] = useState(pipeline?.target_schema ?? '')
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceColumns, setSourceColumns] = useState<Record<number, string[]>>({})
  const [loadingColumns, setLoadingColumns] = useState<Record<number, boolean>>({})
  const [advancedOpen, setAdvancedOpen] = useState<Record<number, boolean>>({})

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  })

  const { data: sourceSchemas, isLoading: loadingSourceSchemas } = useQuery({
    queryKey: ['schemas', sourceId],
    queryFn: () => schemaService.getSchemas(sourceId),
    enabled: !!sourceId,
  })

  const { data: targetSchemas, isLoading: loadingTargetSchemas } = useQuery({
    queryKey: ['schemas', targetId],
    queryFn: () => schemaService.getSchemas(targetId),
    enabled: !!targetId,
  })

  useEffect(() => {
    if (sourceSchemas && sourceSchemas.length > 0 && !sourceSchema) {
      setSourceSchema(sourceSchemas[0])
    }
  }, [sourceSchemas, sourceSchema])

  useEffect(() => {
    if (targetSchemas && targetSchemas.length > 0 && !targetSchema) {
      setTargetSchema(targetSchemas[0])
    }
  }, [targetSchemas, targetSchema])

  const dto = (): CreateSyncPipelineDto => ({
    name,
    source_connection_id: sourceId,
    target_connection_id: targetId,
    source_schema: sourceSchema || undefined,
    target_schema: targetSchema || undefined,
    mode,
    tables,
    batch_size: 0,
    ...(pipeline?.id ? { id: pipeline.id } : {}),
  } as unknown as CreateSyncPipelineDto)

  const handleSave = async () => {
    if (!name || !sourceId || !targetId) {
      setError('Name, source, and target are required.')
      return
    }
    setSaving(true); setError(null)
    try {
      await savePipeline(dto())
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleValidate = async () => {
    if (!name || !sourceId || !targetId) {
      setError('Name, source, and target are required.')
      return
    }
    setValidating(true); setError(null)
    try {
      await validatePipeline(dto())
    } catch (e) {
      setError(String(e))
    } finally {
      setValidating(false)
    }
  }

  const addTable = () => {
    setTables([...tables, { source_table: '', target_table: '', column_mappings: [] }])
  }

  const addAllTables = async () => {
    if (!sourceId || !sourceSchema) return
    try {
      const sourceTables = await schemaService.getTables(sourceId, sourceSchema)
      const existingNames = new Set(tables.map((t) => t.source_table))
      const newTables: SyncTableConfig[] = []
      const newColumns: Record<number, string[]> = {}

      for (let idx = 0; idx < sourceTables.length; idx++) {
        const tableName = sourceTables[idx].name
        if (existingNames.has(tableName)) continue

        try {
          const cols = await schemaService.getColumns(sourceId, tableName, sourceSchema)
          const colNames = cols.map((c) => c.name)
          const globalIdx = tables.length + newTables.length
          newColumns[globalIdx] = colNames
          newTables.push({
            source_table: tableName,
            target_table: tableName,
            column_mappings: colNames.map((name) => ({
              source_column: name,
              destination_column: name,
            })),
          })
        } catch {
          newTables.push({
            source_table: tableName,
            target_table: tableName,
            column_mappings: [],
          })
        }
      }

      if (newTables.length > 0) {
        setTables([...tables, ...newTables])
        setSourceColumns({ ...sourceColumns, ...newColumns })
      }
    } catch {
      // ignore
    }
  }

  const updateTable = (i: number, field: keyof SyncTableConfig, value: unknown) => {
    const newTables = tables.map((t, j) => j === i ? { ...t, [field]: value } as SyncTableConfig : t)
    setTables(newTables)
    if (field === 'source_table' && sourceId && sourceSchema && value) {
      setLoadingColumns((prev) => ({ ...prev, [i]: true }))
      schemaService.getColumns(sourceId, value as string, sourceSchema)
        .then((cols) => {
          const colNames = cols.map((c) => c.name)
          setSourceColumns((prev) => ({ ...prev, [i]: colNames }))
          const mappings: ColumnMapping[] = colNames.map((name) => ({
            source_column: name,
            destination_column: name,
          }))
          const updatedTables = newTables.map((t, j) =>
            j === i ? { ...t, column_mappings: mappings } : t
          )
          setTables(updatedTables)
        })
        .catch(() => { /* ignore */ })
        .finally(() => {
          setLoadingColumns((prev) => ({ ...prev, [i]: false }))
        })
    }
  }

  const removeTable = (i: number) => {
    setTables(tables.filter((_, j) => j !== i))
  }

  const updateMappings = (i: number, mappings: ColumnMapping[]) => {
    updateTable(i, 'column_mappings', mappings)
  }

  const isEditing = !!pipeline

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-secondary/95 border border-border shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-border flex items-center justify-between bg-background/50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary/10 border border-primary/20 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground uppercase">
                {isEditing ? 'Edit Pipeline' : 'New Pipeline'}
              </h2>
              <p className="text-[var(--ch-text-10)] text-muted-foreground font-bold uppercase tracking-widest">Cross-DB Sync Configuration</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 scrollbar-thin">
          {error && (
            <div className="p-3 border border-destructive/20 bg-destructive/5 flex items-center gap-3">
              <p className="text-[var(--ch-text-11)] font-bold uppercase tracking-wider text-destructive">{error}</p>
            </div>
          )}

          {validation && !validation.is_valid && (
            <div className="p-3 border border-orange-500/20 bg-orange-500/5 space-y-1">
              <p className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-orange-500">Validation Issues</p>
              {validation.warnings.map((w, i) => (
                <p key={i} className="text-xs text-orange-400/80">{w}</p>
              ))}
              {validation.errors.map((e, i) => (
                <p key={i} className="text-xs text-destructive">{e}</p>
              ))}
            </div>
          )}

          {validation?.is_valid && (
            <div className="p-3 border border-emerald-500/20 bg-emerald-500/5">
              <p className="text-[var(--ch-text-11)] font-bold uppercase tracking-wider text-emerald-500">Validation Passed</p>
            </div>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Tooltip content="A descriptive name to identify this pipeline">
              <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Pipeline Name</label>
            </Tooltip>
            <input
              className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production → Analytics Sync"
            />
          </div>

          {/* Source / Target selector */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <ConnectionSelector
                label="Source Connection"
                tooltip="Select the source database — data will be read from here"
                value={sourceId}
                onChange={(v) => {
                  setSourceId(v)
                  setSourceSchema('')
                }}
                connections={connections ?? []}
              />
              {sourceId && (
                <div className="space-y-1">
                  <Tooltip content="Select the schema to sync from">
                    <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Source Schema</label>
                  </Tooltip>
                  {loadingSourceSchemas ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading schemas...
                    </div>
                  ) : (
                    <select
                      className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
                      value={sourceSchema}
                      onChange={(e) => setSourceSchema(e.target.value)}
                    >
                      <option value="">— Select Schema —</option>
                      {(sourceSchemas ?? []).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <ConnectionSelector
                label="Target Connection"
                tooltip="Select the target database — data will be written here"
                value={targetId}
                onChange={(v) => {
                  setTargetId(v)
                  setTargetSchema('')
                }}
                connections={connections ?? []}
              />
              {targetId && (
                <div className="space-y-1">
                  <Tooltip content="Select the schema to sync to">
                    <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Target Schema</label>
                  </Tooltip>
                  {loadingTargetSchemas ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading schemas...
                    </div>
                  ) : (
                    <select
                      className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
                      value={targetSchema}
                      onChange={(e) => setTargetSchema(e.target.value)}
                    >
                      <option value="">— Select Schema —</option>
                      {(targetSchemas ?? []).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sync Mode */}
          <div className="space-y-2">
            <Tooltip content="Full: copies all data each run. Incremental: only copies new/changed data since the last sync">
              <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">Sync Mode</label>
            </Tooltip>
            <select
              className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
              value={mode}
              onChange={(e) => setMode(e.target.value as SyncMode)}
            >
              <option value={SyncMode.Full}>Full Sync</option>
              <option value={SyncMode.Incremental}>Incremental Sync</option>
            </select>
          </div>

          {/* Tables */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Tooltip content="Define the tables to synchronize and their column mappings">
                <span className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground">Tables</span>
              </Tooltip>
              <div className="flex items-center gap-3">
                <button
                  onClick={addAllTables}
                  disabled={!sourceId || !sourceSchema}
                  className="flex items-center gap-1 text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ListChecks className="w-3 h-3" />
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

            {tables.map((table, i) => (
              <div key={i} className="border border-border bg-muted/20 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Table {i + 1}</span>
                  <button onClick={() => removeTable(i)} className="p-1 text-muted-foreground hover:text-destructive">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Tooltip content="Source table name (e.g. users)">
                      <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Source Table</label>
                    </Tooltip>
                    <input
                      className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                      value={table.source_table}
                      onChange={(e) => updateTable(i, 'source_table', e.target.value)}
                      placeholder="users"
                    />
                  </div>
                  <div className="space-y-1">
                    <Tooltip content="Target table name (e.g. users)">
                      <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Target Table</label>
                    </Tooltip>
                    <input
                      className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                      value={table.target_table}
                      onChange={(e) => updateTable(i, 'target_table', e.target.value)}
                      placeholder="users"
                    />
                  </div>
                </div>

                {/* Auto-detected columns - read only summary */}
                {loadingColumns[i] ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" /> Detecting columns...
                  </div>
                ) : sourceColumns[i] && sourceColumns[i].length > 0 ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Database className="w-3 h-3" />
                    {sourceColumns[i].length} columns detected — all will be synchronized automatically
                  </div>
                ) : null}

                {/* Advanced: column mappings, filters, primary key */}
                <div className="border border-dashed border-border/50">
                  <button
                    onClick={() => setAdvancedOpen((prev) => ({ ...prev, [i]: !prev[i] }))}
                    className="flex items-center gap-2 w-full px-3 py-2 text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {advancedOpen[i] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <Columns className="w-3 h-3" />
                    Advanced Options (column mapping, filters, primary key)
                  </button>
                  {advancedOpen[i] && (
                    <div className="px-3 pb-3 space-y-4">
                      <div className="space-y-1">
                        <Tooltip content="Optional SQL WHERE clause to filter rows during extraction">
                          <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Filter (SQL WHERE clause)</label>
                        </Tooltip>
                        <input
                          className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                          value={table.filters ?? ''}
                          onChange={(e) => updateTable(i, 'filters', e.target.value || undefined)}
                          placeholder="e.g. created_at > '2024-01-01'"
                        />
                      </div>
                      <div className="space-y-1">
                        <Tooltip content="Primary key columns for incremental sync (auto-detected if left empty)">
                          <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Primary Key(s)</label>
                        </Tooltip>
                        <input
                          className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                          value={table.primary_key?.join(', ') ?? ''}
                          onChange={(e) => updateTable(i, 'primary_key', e.target.value ? e.target.value.split(',').map((s) => s.trim()) : undefined)}
                          placeholder="Auto-detected if empty"
                        />
                      </div>
                      <ColumnMapper
                        sourceColumns={sourceColumns[i] ?? []}
                        targetColumns={[]}
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
                No tables configured. Click "Add Table" to start.
              </p>
            )}
          </div>
        </div>

        <div className="p-6 bg-muted/30 border-t border-border flex items-center justify-between gap-4">
          <Tooltip content="Test the pipeline configuration without saving — checks connections and table schemas">
            <button
              onClick={handleValidate}
              disabled={validating}
              className="flex items-center gap-2 bg-muted text-foreground px-4 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-widest hover:bg-muted/80 border border-border transition-all disabled:opacity-50"
            >
              {validating ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
              Validate
            </button>
          </Tooltip>

          <div className="flex items-center gap-4">
            <button onClick={onClose} className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <Tooltip content={isEditing ? 'Save changes to this pipeline' : 'Save the pipeline and start using it'}>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {isEditing ? 'Update Pipeline' : 'Create Pipeline'}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ConnectionSelectorProps {
  label: string
  tooltip?: string
  value: string
  onChange: (id: string) => void
  connections: Connection[]
}

function ConnectionSelector({ label, tooltip, value, onChange, connections }: ConnectionSelectorProps) {
  return (
    <div className="space-y-2">
      <Tooltip content={tooltip ?? ''}>
        <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</label>
      </Tooltip>
      <select
        className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Select Connection —</option>
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.type.toUpperCase()} — {c.host}:{c.port})
          </option>
        ))}
      </select>
    </div>
  )
}
