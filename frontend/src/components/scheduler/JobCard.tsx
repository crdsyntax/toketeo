import { Play, Pencil, Trash2, CalendarClock, Database, FileJson, FileSpreadsheet, FileDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JobType } from '@/types/database'
import type { ScheduledJob, Connection } from '@/types/database'

interface JobCardProps {
  job: ScheduledJob
  connections: Connection[]
  onEdit: (job: ScheduledJob) => void
  onDelete: (job: ScheduledJob) => void
  onRunNow: (job: ScheduledJob) => void
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

export function JobCard({ job, connections, onEdit, onDelete, onRunNow }: JobCardProps) {
  const config = jobTypeConfig[job.jobType]
  const Icon = config.icon
  const conn = connections.find((c) => c.id === job.connectionId)
  const connLabel = conn ? `${conn.name} (${conn.type.toUpperCase()})` : job.connectionId.slice(0, 8)

  return (
    <div className="group relative flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', job.enabled ? 'bg-primary/10' : 'bg-muted/40')}>
        <Icon className={cn('w-4 h-4', job.enabled ? config.color : 'text-muted-foreground/50')} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate">{job.name}</span>
          {!job.enabled && (
            <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">Paused</span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
          <span className="font-mono">{job.cronExpression}</span>
          <span className="flex items-center gap-1">
            <Database className="w-3 h-3" />
            {connLabel}
          </span>
        </div>

        <div className="flex items-center gap-4 mt-1.5 text-[10px]">
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

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => onRunNow(job)}
          className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
          title="Run now"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
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
