import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitBranch, X, Loader2, Database, Save, ArrowRight, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { connectionService } from '@/services/connection.service'
import { syncService } from '@/services/sync.service'
import { useSyncStore } from '@/store/syncStore'
import { ColumnMapper } from '@/components/sync/ColumnMapper'
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
  const [batchSize, setBatchSize] = useState(pipeline?.batch_size ?? 1000)
  const [tables, setTables] = useState<SyncTableConfig[]>(pipeline?.tables ?? [])
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  })

  const sourceConn = connections?.find((c) => c.id === sourceId)
  const targetConn = connections?.find((c) => c.id === targetId)

  const dto = (): CreateSyncPipelineDto => ({
    name,
    source_connection_id: sourceId,
    target_connection_id: targetId,
    mode,
    tables,
    batch_size: batchSize,
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

  const updateTable = (i: number, field: keyof SyncTableConfig, value: unknown) => {
    setTables(tables.map((t, j) => j === i ? { ...t, [field]: value } as SyncTableConfig : t))
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
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Cross-DB Sync Configuration</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 scrollbar-thin">
          {error && (
            <div className="p-3 border border-destructive/20 bg-destructive/5 flex items-center gap-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-destructive">{error}</p>
            </div>
          )}

          {validation && !validation.is_valid && (
            <div className="p-3 border border-orange-500/20 bg-orange-500/5 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange-500">Validation Issues</p>
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
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">Validation Passed</p>
            </div>
          )}

          {/* Name */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Pipeline Name</label>
            <input
              className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production → Analytics Sync"
            />
          </div>

          {/* Source / Target selector */}
          <div className="grid grid-cols-2 gap-6">
            <ConnectionSelector
              label="Source Connection"
              value={sourceId}
              onChange={setSourceId}
              connections={connections ?? []}
            />
            <ConnectionSelector
              label="Target Connection"
              value={targetId}
              onChange={setTargetId}
              connections={connections ?? []}
            />
          </div>

          {/* Mode + Batch Size */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Sync Mode</label>
              <select
                className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
                value={mode}
                onChange={(e) => setMode(e.target.value as SyncMode)}
              >
                <option value={SyncMode.Full}>Full Sync</option>
                <option value={SyncMode.Incremental}>Incremental Sync</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Batch Size</label>
              <input
                type="number"
                className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 1000)}
                min={1}
              />
            </div>
          </div>

          {/* Tables */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tables</span>
              <button
                onClick={addTable}
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
              >
                <Database className="w-3 h-3" /> Add Table
              </button>
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
                    <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Source Table</label>
                    <input
                      className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                      value={table.source_table}
                      onChange={(e) => updateTable(i, 'source_table', e.target.value)}
                      placeholder="schema.table_name"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Target Table</label>
                    <input
                      className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                      value={table.target_table}
                      onChange={(e) => updateTable(i, 'target_table', e.target.value)}
                      placeholder="schema.table_name"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Filter (WHERE clause)</label>
                  <input
                    className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                    value={table.filters ?? ''}
                    onChange={(e) => updateTable(i, 'filters', e.target.value || undefined)}
                    placeholder="e.g. created_at > '2024-01-01'"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Primary Key(s) (comma-separated)</label>
                  <input
                    className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                    value={table.primary_key?.join(', ') ?? ''}
                    onChange={(e) => updateTable(i, 'primary_key', e.target.value ? e.target.value.split(',').map((s) => s.trim()) : undefined)}
                    placeholder="id"
                  />
                </div>

                <ColumnMapper
                  sourceColumns={[]}
                  targetColumns={[]}
                  mappings={table.column_mappings}
                  onChange={(mappings) => updateMappings(i, mappings)}
                />
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
          <button
            onClick={handleValidate}
            disabled={validating}
            className="flex items-center gap-2 bg-muted text-foreground px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-muted/80 border border-border transition-all disabled:opacity-50"
          >
            {validating ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
            Validate
          </button>

          <div className="flex items-center gap-4">
            <button onClick={onClose} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 text-[10px] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {isEditing ? 'Update Pipeline' : 'Create Pipeline'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ConnectionSelectorProps {
  label: string
  value: string
  onChange: (id: string) => void
  connections: Connection[]
}

function ConnectionSelector({ label, value, onChange, connections }: ConnectionSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</label>
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
