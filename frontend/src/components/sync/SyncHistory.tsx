import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, CheckCircle2, XCircle, Loader2, PauseCircle, ChevronDown, ChevronRight, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { syncService } from '@/services/sync.service'
import type { SyncRun } from '@/types/sync'
import { PipelineStatus } from '@/types/sync'

interface SyncHistoryProps {
  pipelineId: string
  onSelectRun?: (run: SyncRun) => void
  activeRunId?: string
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'justo ahora'
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}

const statusInfo = (s: PipelineStatus) => {
  switch (s) {
    case PipelineStatus.Completed: return { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Completado' }
    case PipelineStatus.Failed: return { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20', label: 'Error' }
    case PipelineStatus.Running: return { icon: Loader2, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', label: 'En progreso' }
    case PipelineStatus.Paused: return { icon: PauseCircle, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', label: 'Pausado' }
    case PipelineStatus.Cancelled: return { icon: XCircle, color: 'text-muted-foreground', bg: 'bg-muted/20', border: 'border-border', label: 'Cancelado' }
    default: return { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted/20', border: 'border-border', label: 'Desconocido' }
  }
}

function RunDetail({ runId }: { runId: string }) {
  const { data: batches } = useQuery({
    queryKey: ['sync-batches', runId],
    queryFn: () => syncService.listBatches(runId),
  })

  if (!batches) return <p className="text-[var(--ch-text-10)] text-muted-foreground py-2">Cargando detalle...</p>
  if (batches.length === 0) return <p className="text-[var(--ch-text-10)] text-muted-foreground py-2">Sin lotes registrados.</p>

  return (
    <div className="space-y-1 py-2">
      {batches.map((b) => (
        <div key={b.id} className="flex items-center gap-2 text-[var(--ch-text-10)] font-mono text-muted-foreground pl-4">
          <span className={cn('w-1.5 h-1.5 rounded-full', b.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500')} />
          <span>Lote {b.batch_number}</span>
          <span>{b.table_name}</span>
          <span className="text-muted-foreground/70">{b.rows_extracted} filas</span>
          {b.duration_ms > 0 && <span>{b.duration_ms}ms</span>}
          {b.error_message && <span className="text-destructive">{b.error_message}</span>}
        </div>
      ))}
    </div>
  )
}

function RunTableSummary({ runId }: { runId: string }) {
  const { data: batches } = useQuery({
    queryKey: ['sync-batches', runId],
    queryFn: () => syncService.listBatches(runId),
    staleTime: 60 * 1000,
  })

  if (!batches || batches.length === 0) return null

  const tableNames = [...new Set(batches.map((b) => b.table_name))]

  return (
    <div className="flex items-center gap-1.5 text-[var(--ch-text-9)] text-muted-foreground/70 mt-1 flex-wrap">
      <Database className="w-2.5 h-2.5 shrink-0" />
      <span className="font-bold uppercase tracking-wider">Tablas:</span>
      {tableNames.length <= 5 ? (
        tableNames.map((t) => (
          <span key={t} className="font-mono">{t}{t !== tableNames[tableNames.length - 1] ? ',' : ''}</span>
        ))
      ) : (
        <span className="font-mono">{tableNames.slice(0, 4).join(', ')}, +{tableNames.length - 4} más</span>
      )}
    </div>
  )
}

export function SyncHistory({ pipelineId, onSelectRun, activeRunId }: SyncHistoryProps) {
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const { data: runs, isLoading } = useQuery({
    queryKey: ['sync-runs', pipelineId],
    queryFn: () => syncService.listRuns(pipelineId),
  })

  if (isLoading) {
    return (
      <div className="border border-border bg-muted/20 p-6 text-center">
        <p className="text-xs text-muted-foreground">Cargando historial...</p>
      </div>
    )
  }

  if (!runs || runs.length === 0) {
    return (
      <div className="border border-border bg-muted/20 p-6 text-center">
        <p className="text-xs text-muted-foreground">Sin ejecuciones aún.</p>
      </div>
    )
  }

  return (
    <div className="border border-border bg-muted/20 max-h-80 overflow-y-auto">
      <div className="relative">
        {runs.map((run, idx) => {
          const info = statusInfo(run.status)
          const Icon = info.icon
          const isActive = run.id === activeRunId
          const isExpanded = expandedRun === run.id
          const isLast = idx === runs.length - 1
          const duration = run.completed_at && run.started_at
            ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
            : null

          return (
            <div key={run.id} className="relative pl-10 py-3 pr-4">
              {/* Timeline line */}
              {!isLast && (
                <div className="absolute left-[17px] top-10 bottom-0 w-px bg-border" />
              )}

              {/* Timeline dot */}
              <div className={cn(
                'absolute left-3 top-3 p-1.5 border',
                isActive ? 'border-primary ring-2 ring-primary/20' : info.border,
              )}>
                <Icon className={cn('w-3.5 h-3.5', info.color, run.status === PipelineStatus.Running && 'animate-spin')} />
              </div>

              {/* Content */}
              <div className={cn(
                'border p-3 cursor-pointer transition-all',
                isActive ? 'border-primary/30 bg-primary/5' : 'border-transparent hover:border-border',
              )}
                onClick={() => {
                  onSelectRun?.(run)
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[var(--ch-text-10)] font-bold uppercase tracking-wider', info.color)}>
                      {info.label}
                    </span>
                    {run.completed_at && (
                      <span className="text-[var(--ch-text-9)] text-muted-foreground">{timeAgo(run.completed_at)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {duration !== null && (
                      <span className="text-[var(--ch-text-10)] text-muted-foreground font-mono">{duration}s</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedRun(isExpanded ? null : run.id) }}
                      className="p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[var(--ch-text-10)] text-muted-foreground font-mono">
                  <span className="text-foreground font-bold">{run.processed_rows.toLocaleString()}</span>
                  <span className="text-muted-foreground/70">filas</span>
                  {run.error_count > 0 && (
                    <>
                      <span className="text-destructive font-bold">{run.error_count}</span>
                      <span className="text-muted-foreground/70">errores</span>
                    </>
                  )}
                  <span>{run.batch_count} lote{run.batch_count !== 1 ? 's' : ''}</span>
                </div>

                <RunTableSummary runId={run.id} />

                {run.started_at && (
                  <p className="text-[var(--ch-text-9)] text-muted-foreground/60 mt-1 font-mono">
                    {new Date(run.started_at).toLocaleString()}
                  </p>
                )}

                {isExpanded && <RunDetail runId={run.id} />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
