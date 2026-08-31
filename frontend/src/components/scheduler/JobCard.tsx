import { Play, Pencil, Trash2, CalendarClock, Database, FileJson, FileSpreadsheet, FileDown, Loader2, Square, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JobType } from '@/types/database'
import type { ScheduledJob, Connection } from '@/types/database'
import type { RunningJob } from '@/store/schedulerStore'

interface JobCardProps {
  job: ScheduledJob
  connections: Connection[]
  runningJob: RunningJob | null
  onEdit: (job: ScheduledJob) => void
  onDelete: (job: ScheduledJob) => void
  onRunNow: (job: ScheduledJob) => void
  onStopNow: (job: ScheduledJob) => void
  onToggleEnabled: (job: ScheduledJob) => void
}

const jobTypeConfig: Record<JobType, { label: string; icon: typeof CalendarClock; color: string }> = {
  [JobType.Backup]: { label: 'Backup', icon: FileDown, color: 'text-blue-500' },
  [JobType.Report]: { label: 'Report', icon: FileJson, color: 'text-emerald-500' },
  [JobType.CsvExport]: { label: 'CSV Export', icon: FileSpreadsheet, color: 'text-amber-500' },
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function JobCard({ job, connections, runningJob, onEdit, onDelete, onRunNow, onStopNow, onToggleEnabled }: JobCardProps) {
  const config = jobTypeConfig[job.jobType]
  const Icon = config.icon
  const conn = connections.find((c) => c.id === job.connectionId)
  const connLabel = conn ? `${conn.name} (${conn.type.toUpperCase()})` : job.connectionId.slice(0, 8)
  const isRunning = runningJob !== null

  return (
    <div className={cn(
      "group relative flex items-start gap-3 p-4 rounded-xl border bg-card hover:bg-muted/30 transition-colors",
      isRunning ? "border-primary/40 bg-primary/5" : "border-border"
    )}>
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', isRunning ? 'bg-primary/20' : job.enabled ? 'bg-primary/10' : 'bg-muted/40')}>
        {isRunning ? (
          <Loader2 className={cn('w-4 h-4 text-primary animate-spin')} />
        ) : (
          <Icon className={cn('w-4 h-4', job.enabled ? config.color : 'text-muted-foreground/50')} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate">{job.name}</span>
          {isRunning && (
            <span className="text-[var(--ch-text-9)] uppercase tracking-widest font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded animate-pulse">
              Running
            </span>
          )}
          {isRunning && runningJob.reconnecting && (
            <span className="text-[var(--ch-text-9)] uppercase tracking-widest font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded animate-pulse">
              Reconnecting
            </span>
          )}
          {!job.enabled && !isRunning && (
            <span className="text-[var(--ch-text-9)] uppercase tracking-widest font-bold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">Paused</span>
          )}
        </div>

        {isRunning && runningJob.reconnecting ? (
          <div className="flex items-center gap-2 mt-1 text-amber-500">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span className="truncate">
              Conexión perdida — reintento {runningJob.retryCount ?? 1} en {runningJob.nextRetrySecs ?? 5}s...
            </span>
          </div>
        ) : isRunning && runningJob.currentTable ? (
          <div className="flex items-center gap-2 mt-1 text-[var(--ch-text-10)] text-primary">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="truncate">
              {runningJob.tableIndex > 0 && `${runningJob.tableIndex}/${runningJob.totalTables} — `}
              Processing <span className="font-semibold">{runningJob.currentTable}</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 mt-1 text-[var(--ch-text-10)] text-muted-foreground">
            <span className={cn('font-mono', !job.cronExpression && 'italic')}>
              {job.cronExpression || 'Manual'}
            </span>
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3" />
              {connLabel}
            </span>
          </div>
        )}

        <div className="flex items-center gap-4 mt-1.5 text-[var(--ch-text-10)]">
          <span>
            <span className="text-muted-foreground/60">Last:</span>{' '}
            <span className={cn(job.lastRun ? 'text-muted-foreground' : 'text-muted-foreground/40')}>
              {formatDate(job.lastRun)}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground/60">Next:</span>{' '}
            <span className={cn(job.enabled ? 'text-primary font-medium' : 'text-muted-foreground/40')}>
              {formatDate(job.nextRun)}
            </span>
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
        <button
          onClick={() => onToggleEnabled(job)}
          disabled={isRunning}
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors disabled:opacity-50',
            job.enabled ? 'bg-primary' : 'bg-muted',
          )}
          title={job.enabled ? 'Desactivar schedule' : 'Activar schedule'}
          aria-pressed={job.enabled}
        >
          <span
            className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
              job.enabled ? 'left-[18px]' : 'left-0.5',
            )}
          />
        </button>
        <span className="text-[var(--ch-text-8)] uppercase tracking-widest font-bold text-muted-foreground/60">
          {job.enabled ? 'On' : 'Off'}
        </span>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {isRunning ? (
          <button
            onClick={() => onStopNow(job)}
            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Stop"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={() => onRunNow(job)}
            className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
            title="Run now"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => onEdit(job)}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(job)}
          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
