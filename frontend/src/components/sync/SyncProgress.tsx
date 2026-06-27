import { useEffect, useState, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Loader2, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SyncEvent, SyncRun } from '@/types/sync'
import { PipelineStatus } from '@/types/sync'

interface SyncProgressProps {
  run: SyncRun
  onEvent?: (event: SyncEvent) => void
}

interface ProgressState {
  totalBatches: number
  completedBatches: number
  processedRows: number
  errors: number
  durationMs: number
  currentTable: string
  phase: 'extracting' | 'loading' | 'done' | 'idle'
}

export function SyncProgress({ run, onEvent }: SyncProgressProps) {
  const [progress, setProgress] = useState<ProgressState>({
    totalBatches: run.batch_count,
    completedBatches: 0,
    processedRows: run.processed_rows,
    errors: run.error_count,
    durationMs: 0,
    currentTable: '',
    phase: 'idle',
  })

  const [startTime] = useState(Date.now())

  useEffect(() => {
    const unlisten = listen<SyncEvent>('sync:event', (event) => {
      const e = event.payload
      onEvent?.(e)

      if (e.BatchCompleted) {
        setProgress((p) => ({
          ...p,
          completedBatches: p.completedBatches + 1,
          processedRows: p.processedRows + e.BatchCompleted!.rows_loaded,
          currentTable: e.BatchCompleted!.table,
          phase: 'loading',
        }))
      } else if (e.RowError) {
        setProgress((p) => ({ ...p, errors: p.errors + 1 }))
      } else if (e.PhaseCompleted) {
        setProgress((p) => ({ ...p, phase: 'done', currentTable: '' }))
      } else if (e.Error) {
        setProgress((p) => ({ ...p, phase: 'done' }))
      }
    })

    return () => { unlisten.then((f) => f()) }
  }, [])

  // Tick duration
  useEffect(() => {
    if (run.status !== PipelineStatus.Running) return
    const interval = setInterval(() => {
      setProgress((p) => ({ ...p, durationMs: Date.now() - startTime }))
    }, 1000)
    return () => clearInterval(interval)
  }, [run.status, startTime])

  const isRunning = run.status === PipelineStatus.Running
  const isCompleted = run.status === PipelineStatus.Completed
  const isFailed = run.status === PipelineStatus.Failed

  const pct = run.total_rows > 0
    ? Math.min(100, Math.round((progress.processedRows / run.total_rows) * 100))
    : progress.completedBatches > 0 ? 50 : 0

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    return `${h > 0 ? h + 'h ' : ''}${m % 60}m ${s % 60}s`
  }

  const rowsPerSec = progress.durationMs > 0
    ? (progress.processedRows / (progress.durationMs / 1000)).toFixed(1)
    : '—'

  return (
    <div className="border border-border bg-muted/20 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          {isFailed && <XCircle className="w-4 h-4 text-destructive" />}
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-widest",
            isRunning && 'text-primary',
            isCompleted && 'text-emerald-500',
            isFailed && 'text-destructive',
          )}>
            {isRunning ? 'Running' : isCompleted ? 'Completed' : isFailed ? 'Failed' : run.status}
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">{formatDuration(progress.durationMs)}</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-muted border border-border overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-500",
            isRunning && 'bg-primary',
            isCompleted && 'bg-emerald-500',
            isFailed && 'bg-destructive',
          )}
          style={{ width: `${isCompleted ? 100 : pct}%` }}
        />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4 text-center">
        <div>
          <p className="text-lg font-bold font-mono text-foreground">{progress.processedRows.toLocaleString()}</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Rows</p>
        </div>
        <div>
          <p className="text-lg font-bold font-mono text-foreground">{run.total_rows.toLocaleString()}</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Total</p>
        </div>
        <div>
          <p className="text-lg font-bold font-mono text-foreground">{progress.errors}</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Errors</p>
        </div>
        <div>
          <p className="text-lg font-bold font-mono text-foreground">{rowsPerSec}</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Rows/s</p>
        </div>
      </div>

      {/* Batch info */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>Batches: {progress.completedBatches} / {Math.max(run.batch_count, progress.completedBatches)}</span>
        {progress.currentTable && (
          <span className="flex items-center gap-1">
            <ArrowRight className="w-3 h-3" /> {progress.currentTable}
          </span>
        )}
      </div>
    </div>
  )
}
