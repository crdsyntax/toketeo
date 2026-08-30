import { useState, useEffect } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { schemaService } from '@/services/schema.service'
import { Tooltip } from '@/components/ui/Tooltip'
import { DatabaseType } from '@/types/database'
import type { Connection } from '@/types/database'
import { SyncMode } from '@/types/sync'

interface Step1ConnectionsProps {
  name: string
  onNameChange: (v: string) => void
  sourceId: string
  onSourceIdChange: (v: string) => void
  targetId: string
  onTargetIdChange: (v: string) => void
  connections: Connection[]
  mode: SyncMode
  onModeChange: (v: SyncMode) => void
  sourceSchema: string
  onSourceSchemaChange: (v: string) => void
  targetSchema: string
  onTargetSchemaChange: (v: string) => void
}

export function Step1Connections({
  name, onNameChange,
  sourceId, onSourceIdChange,
  targetId, onTargetIdChange,
  connections,
  mode, onModeChange,
  sourceSchema, onSourceSchemaChange,
  targetSchema, onTargetSchemaChange,
}: Step1ConnectionsProps) {
  const queryClient = useQueryClient()
  const [sourceDatabase, setSourceDatabase] = useState('')
  const [targetDatabase, setTargetDatabase] = useState('')

  const sourceConn = connections.find((c) => c.id === sourceId)
  const targetConn = connections.find((c) => c.id === targetId)
  const isSourcePostgres = sourceConn?.type === DatabaseType.POSTGRES
  const isTargetPostgres = targetConn?.type === DatabaseType.POSTGRES

  const { data: sourceDatabases, isLoading: loadingSourceDatabases } = useQuery({
    queryKey: ['databases', sourceId],
    queryFn: () => schemaService.getDatabases(sourceId),
    enabled: isSourcePostgres && !!sourceId,
  })

  const { data: targetDatabases, isLoading: loadingTargetDatabases } = useQuery({
    queryKey: ['databases', targetId],
    queryFn: () => schemaService.getDatabases(targetId),
    enabled: isTargetPostgres && !!targetId,
  })

  const [prevSourceDbList, setPrevSourceDbList] = useState(sourceDatabases)
  if (sourceDatabases !== prevSourceDbList) {
    setPrevSourceDbList(sourceDatabases)
    if (isSourcePostgres && sourceDatabases && sourceDatabases.length > 0 && !sourceDatabase) {
      setSourceDatabase(sourceDatabases[0])
    }
  }

  const [prevTargetDbList, setPrevTargetDbList] = useState(targetDatabases)
  if (targetDatabases !== prevTargetDbList) {
    setPrevTargetDbList(targetDatabases)
    if (isTargetPostgres && targetDatabases && targetDatabases.length > 0 && !targetDatabase) {
      setTargetDatabase(targetDatabases[0])
    }
  }

  const sourceSchemasEnabled = isSourcePostgres ? (!!sourceId && !!sourceDatabase) : !!sourceId
  const targetSchemasEnabled = isTargetPostgres ? (!!targetId && !!targetDatabase) : !!targetId

  const { data: sourceSchemas, isLoading: loadingSourceSchemas, error: sourceSchemasError } = useQuery({
    queryKey: ['schemas', sourceId, ...(isSourcePostgres ? [sourceDatabase] : [])],
    queryFn: async () => {
      if (isSourcePostgres && sourceDatabase) {
        await schemaService.switchDatabase(sourceId, sourceDatabase)
      }
      return schemaService.getSchemas(sourceId)
    },
    enabled: sourceSchemasEnabled,
  })

  const { data: targetSchemas, isLoading: loadingTargetSchemas, error: targetSchemasError } = useQuery({
    queryKey: ['schemas', targetId, ...(isTargetPostgres ? [targetDatabase] : [])],
    queryFn: async () => {
      if (isTargetPostgres && targetDatabase) {
        await schemaService.switchDatabase(targetId, targetDatabase)
      }
      return schemaService.getSchemas(targetId)
    },
    enabled: targetSchemasEnabled,
  })

  useEffect(() => {
    if (sourceSchemas && sourceSchemas.length > 0 && !sourceSchema) {
      onSourceSchemaChange(sourceSchemas[0])
    }
  }, [sourceSchemas, sourceSchema, onSourceSchemaChange])

  useEffect(() => {
    if (targetSchemas && targetSchemas.length > 0 && !targetSchema) {
      onTargetSchemaChange(targetSchemas[0])
    }
  }, [targetSchemas, targetSchema, onTargetSchemaChange])

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Sync Name
        </label>
        <input
          className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none transition-all"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="E.g. Production → Analytics"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Source Connection
            </label>
            <button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['connections'] })
                if (isSourcePostgres && sourceId) queryClient.invalidateQueries({ queryKey: ['databases', sourceId] })
                if (sourceId) queryClient.invalidateQueries({ queryKey: ['schemas', sourceId] })
              }}
              className="flex items-center gap-1 text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
              title="Reload"
            >
              <RefreshCw className="w-3 h-3" />
              Reload
            </button>
          </div>
          <select
            className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
            value={sourceId}
            onChange={(e) => {
              onSourceIdChange(e.target.value)
              onSourceSchemaChange('')
              setSourceDatabase('')
            }}
          >
            <option value="">— Select —</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type.toUpperCase()})
              </option>
            ))}
          </select>
          {isSourcePostgres && sourceId && (
            <div className="space-y-1">
              <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Database</label>
              {loadingSourceDatabases ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading databases...
                </div>
              ) : (
                <select
                  className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
                  value={sourceDatabase}
                  onChange={(e) => {
                    setSourceDatabase(e.target.value)
                    onSourceSchemaChange('')
                  }}
                >
                  <option value="">— Select DB —</option>
                  {(sourceDatabases ?? []).map((db) => (
                    <option key={db} value={db}>{db}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          {sourceId && (isSourcePostgres ? !!sourceDatabase : true) && (
            <div className="space-y-1">
              <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Source Schema</label>
              {loadingSourceSchemas ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading schemas...
                </div>
              ) : sourceSchemasError ? (
                <div className="space-y-1">
                  <select disabled className="w-full bg-background border border-border px-3 py-2 text-xs font-mono opacity-50">
                    <option>Could not load schemas</option>
                  </select>
                  <p className="text-[var(--ch-text-9)] text-amber-500">
                    Activate the connection from the sidebar and click "Reload"
                  </p>
                </div>
              ) : (
                <select
                  className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
                  value={sourceSchema}
                  onChange={(e) => onSourceSchemaChange(e.target.value)}
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
          <div className="flex items-center justify-between">
            <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Target Connection
            </label>
            <button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['connections'] })
                if (isTargetPostgres && targetId) queryClient.invalidateQueries({ queryKey: ['databases', targetId] })
                if (targetId) queryClient.invalidateQueries({ queryKey: ['schemas', targetId] })
              }}
              className="flex items-center gap-1 text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
              title="Reload"
            >
              <RefreshCw className="w-3 h-3" />
              Reload
            </button>
          </div>
          <select
            className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
            value={targetId}
            onChange={(e) => {
              onTargetIdChange(e.target.value)
              onTargetSchemaChange('')
              setTargetDatabase('')
            }}
          >
            <option value="">— Select —</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type.toUpperCase()})
              </option>
            ))}
          </select>
          {isTargetPostgres && targetId && (
            <div className="space-y-1">
              <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Database</label>
              {loadingTargetDatabases ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading databases...
                </div>
              ) : (
                <select
                  className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
                  value={targetDatabase}
                  onChange={(e) => {
                    setTargetDatabase(e.target.value)
                    onTargetSchemaChange('')
                  }}
                >
                  <option value="">— Select DB —</option>
                  {(targetDatabases ?? []).map((db) => (
                    <option key={db} value={db}>{db}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          {targetId && (isTargetPostgres ? !!targetDatabase : true) && (
            <div className="space-y-1">
              <label className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Target Schema</label>
              {loadingTargetSchemas ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading schemas...
                </div>
              ) : targetSchemasError ? (
                <div className="space-y-1">
                  <select disabled className="w-full bg-background border border-border px-3 py-2 text-xs font-mono opacity-50">
                    <option>Could not load schemas</option>
                  </select>
                  <p className="text-[var(--ch-text-9)] text-amber-500">
                    Activate the connection from the sidebar and click "Reload"
                  </p>
                </div>
              ) : (
                <select
                  className="w-full bg-background border border-border px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
                  value={targetSchema}
                  onChange={(e) => onTargetSchemaChange(e.target.value)}
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

      <div className="space-y-2">
        <Tooltip content="Full: copies all data. Incremental: only new data since last sync">
          <label className="text-[var(--ch-text-10)] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Sync Mode
          </label>
        </Tooltip>
        <select
          className="w-full bg-background border border-border px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none appearance-none cursor-pointer"
          value={mode}
          onChange={(e) => onModeChange(e.target.value as SyncMode)}
        >
          <option value={SyncMode.Full}>Full — copies all data</option>
          <option value={SyncMode.Incremental}>Incremental — only changes since last run</option>
        </select>
        <p className="text-[var(--ch-text-10)] text-muted-foreground">
          {mode === SyncMode.Incremental
            ? 'Requires a primary key column to detect changes.'
            : 'Overwrites all data in the target on every run.'}
        </p>
      </div>
    </div>
  )
}
