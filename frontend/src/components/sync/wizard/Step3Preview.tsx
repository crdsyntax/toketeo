import { useState } from 'react'
import { ArrowRight, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { useSyncStore } from '@/store/syncStore'
import type { Connection } from '@/types/database'
import type { SyncTableConfig, CreateSyncPipelineDto } from '@/types/sync'
import { SyncMode } from '@/types/sync'

interface Step3PreviewProps {
  name: string
  sourceId: string
  targetId: string
  tables: SyncTableConfig[]
  mode: SyncMode
  connections: Connection[]
}

export function Step3Preview({
  name,
  sourceId,
  targetId,
  tables,
  mode,
  connections,
}: Step3PreviewProps) {
  const validatePipeline = useSyncStore((s) => s.validatePipeline)
  const validation = useSyncStore((s) => s.validation)
  const [validating, setValidating] = useState(false)

  const sourceConn = connections.find((c) => c.id === sourceId)
  const targetConn = connections.find((c) => c.id === targetId)

  const handleValidate = async () => {
    setValidating(true)
    try {
      const dto = {
        name,
        source_connection_id: sourceId,
        target_connection_id: targetId,
        mode,
        tables,
        batch_size: 0,
      } as CreateSyncPipelineDto
      await validatePipeline(dto)
    } catch {

    } finally {
      setValidating(false)
    }
  }

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-center gap-4 p-6 border border-border bg-muted/20">
        <div className="text-center">
          <p className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Source</p>
          <p className="text-sm font-bold mt-1">{sourceConn?.name ?? sourceId}</p>
          <p className="text-[var(--ch-text-10)] text-muted-foreground">{sourceConn?.type.toUpperCase()}</p>
        </div>
        <div className="flex flex-col items-center">
          <ArrowRight className="w-6 h-6 text-primary" />
          <span className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-primary mt-1">
            {mode === SyncMode.Full ? 'Full' : 'Incremental'}
          </span>
        </div>
        <div className="text-center">
          <p className="text-[var(--ch-text-9)] font-bold uppercase tracking-wider text-muted-foreground">Target</p>
          <p className="text-sm font-bold mt-1">{targetConn?.name ?? targetId}</p>
          <p className="text-[var(--ch-text-10)] text-muted-foreground">{targetConn?.type.toUpperCase()}</p>
        </div>
      </div>


      <div className="space-y-2">
        <span className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground">
          Tables ({tables.length})
        </span>
        {tables.map((table, i) => (
          <div key={i} className="flex items-center gap-3 p-3 border border-border bg-muted/10">
            <span className="text-xs font-mono font-bold">{table.source_table}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-mono">{table.target_table}</span>
            <span className="text-[var(--ch-text-9)] text-muted-foreground ml-auto">
              {table.column_mappings.length} columns
            </span>
          </div>
        ))}
      </div>


      <div className="space-y-3">
        <button
          onClick={handleValidate}
          disabled={validating}
          className="flex items-center gap-2 bg-muted text-foreground px-4 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-widest hover:bg-muted/80 border border-border transition-all disabled:opacity-50"
        >
          {validating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {validating ? 'Validating...' : 'Validate configuration'}
        </button>

        {validation && (
          <div className="space-y-2">
            {validation.is_valid ? (
              <div className="flex items-center gap-2 p-3 border border-emerald-500/20 bg-emerald-500/5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold text-emerald-500">
                  {tables.length} table(s) ready to sync
                </span>
              </div>
            ) : (
              <div className="p-3 border border-orange-500/20 bg-orange-500/5 space-y-1">
                {!validation.source_connection_ok && (
                  <div className="flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-xs text-destructive">Cannot connect to source database</span>
                  </div>
                )}
                {!validation.target_connection_ok && (
                  <div className="flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-xs text-destructive">Cannot connect to target database</span>
                  </div>
                )}
                {validation.warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-xs text-orange-400/80">{w}</span>
                  </div>
                ))}
                {validation.errors.map((e, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-xs text-destructive">{e}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
