import { useQuery } from '@tanstack/react-query'
import { Clock, CheckCircle2, XCircle, Loader2, PauseCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { syncService } from '@/services/sync.service'
import type { SyncRun } from '@/types/sync'
import { PipelineStatus } from '@/types/sync'

interface SyncHistoryProps {
  pipelineId: string
  onSelectRun?: (run: SyncRun) => void
  activeRunId?: string
}

const statusIcon = (s: PipelineStatus) => {
  switch (s) {
    case PipelineStatus.Completed: return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
    case PipelineStatus.Failed: return <XCircle className="w-3.5 h-3.5 text-destructive" />
    case PipelineStatus.Running: return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
    case PipelineStatus.Paused: return <PauseCircle className="w-3.5 h-3.5 text-orange-500" />
    default: return <Clock className="w-3.5 h-3.5 text-muted-foreground" />
  }
}

export function SyncHistory({ pipelineId, onSelectRun, activeRunId }: SyncHistoryProps) {
  const { data: runs, isLoading } = useQuery({
    queryKey: ['sync-runs', pipelineId],
    queryFn: () => syncService.listRuns(pipelineId),
  })

  if (isLoading) {
    return (
      <div className="border border-border bg-muted/20 p-6 text-center">
        <p className="text-xs text-muted-foreground">Loading history...</p>
      </div>
    )
  }

  if (!runs || runs.length === 0) {
    return (
      <div className="border border-border bg-muted/20 p-6 text-center">
        <p className="text-xs text-muted-foreground">No runs yet.</p>
      </div>
    )
  }

  return (
    <div className="border border-border bg-muted/20 divide-y divide-border max-h-80 overflow-y-auto">
      {runs.map((run) => {
        const isActive = run.id === activeRunId
        return (
          <button
            key={run.id}
            onClick={() => onSelectRun?.(run)}
            className={cn(
              "w-full flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors text-left",
              isActive && 'bg-primary/5',
            )}
          >
            {statusIcon(run.status)}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className={cn(
                  "font-bold uppercase tracking-wider",
                  isActive ? 'text-primary' : 'text-foreground',
                )}>
                  {run.status}
                </span>
                <span className="text-muted-foreground font-mono">
                  {run.processed_rows.toLocaleString()} / {run.total_rows.toLocaleString()} rows
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono mt-0.5">
                {run.started_at && <span>{new Date(run.started_at).toLocaleString()}</span>}
                <span>{run.batch_count} batches</span>
                <span>{run.error_count} errors</span>
              </div>
            </div>

            {run.completed_at && (
              <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                {Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at!).getTime()) / 1000)}s
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
