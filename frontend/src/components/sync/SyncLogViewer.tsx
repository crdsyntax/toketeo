import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { syncService } from '@/services/sync.service'
import type { SyncBatch, SyncRowError } from '@/types/sync'

interface SyncLogViewerProps {
  runId: string
}

export function SyncLogViewer({ runId }: SyncLogViewerProps) {
  const { data: batches, isLoading } = useQuery({
    queryKey: ['sync-batches', runId],
    queryFn: () => syncService.listBatches(runId),
  })

  if (isLoading) {
    return (
      <div className="border border-border bg-muted/20 p-6 text-center">
        <p className="text-xs text-muted-foreground">Loading batches...</p>
      </div>
    )
  }

  if (!batches || batches.length === 0) {
    return (
      <div className="border border-border bg-muted/20 p-6 text-center">
        <p className="text-xs text-muted-foreground">No batches recorded.</p>
      </div>
    )
  }

  return (
    <div className="border border-border bg-muted/20 divide-y divide-border">
      {batches.map((batch) => (
        <BatchRow key={batch.id} batch={batch} />
      ))}
    </div>
  )
}

function BatchRow({ batch }: { batch: SyncBatch }) {
  const [expanded, setExpanded] = useState(false)

  const { data: errors } = useQuery({
    queryKey: ['sync-row-errors', batch.id],
    queryFn: () => syncService.listRowErrors(batch.id),
    enabled: expanded,
  })

  const isSuccess = batch.status === 'completed'
  const isError = batch.status === 'failed'

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}

        <div className={cn(
          "w-2 h-2 rounded-full shrink-0",
          isSuccess && 'bg-emerald-500',
          isError && 'bg-destructive',
          !isSuccess && !isError && 'bg-muted-foreground',
        )} />

        <div className="flex-1 grid grid-cols-6 gap-2 text-xs">
          <span className="font-mono font-bold text-foreground">#{batch.batch_number}</span>
          <span className="font-mono text-muted-foreground truncate">{batch.table_name}</span>
          <span className="font-mono text-muted-foreground">{batch.rows_loaded} / {batch.rows_extracted} rows</span>
          <span className="font-mono text-muted-foreground">{batch.duration_ms}ms</span>
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "font-bold uppercase tracking-wider text-[var(--ch-text-10)]",
              isSuccess && 'text-emerald-500',
              isError && 'text-destructive',
            )}>
              {batch.status}
            </span>
            {batch.skipped_rows > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 text-[var(--ch-text-9)] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20">
                {batch.skipped_rows} skipped
              </span>
            )}
          </div>
          <span />
        </div>

        {batch.error_message && (
          <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-6 pb-3 space-y-1">
          {batch.error_message && (
            <div className="p-2 border border-destructive/20 bg-destructive/5 text-xs text-destructive font-mono">
              {batch.error_message}
            </div>
          )}

          {errors && errors.length > 0 && (
            <div className="space-y-1 mt-2">
              <p className="text-[var(--ch-text-10)] font-bold uppercase tracking-wider text-muted-foreground">Row Errors ({errors.length})</p>
              {errors.map((err) => (
                <RowErrorRow key={err.id} error={err} />
              ))}
            </div>
          )}

          {(!errors || errors.length === 0) && !batch.error_message && (
            <p className="text-[var(--ch-text-10)] text-muted-foreground font-mono">No errors in this batch.</p>
          )}
        </div>
      )}
    </div>
  )
}

function RowErrorRow({ error }: { error: SyncRowError }) {
  return (
    <div className="flex items-start gap-2 p-2 bg-destructive/5 border border-destructive/10 text-xs font-mono">
      <XCircle className="w-3 h-3 text-destructive mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        {error.row_key && <span className="text-muted-foreground">[{error.row_key}] </span>}
        {error.column_name && <span className="text-muted-foreground">{error.column_name}: </span>}
        <span className="text-destructive">{error.error_message}</span>
        {error.raw_value && (
          <div className="text-muted-foreground/60 truncate mt-0.5">{error.raw_value}</div>
        )}
      </div>
    </div>
  )
}
