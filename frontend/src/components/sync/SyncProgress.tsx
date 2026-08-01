import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Loader2, CheckCircle2, AlertTriangle, Database, ArrowRightFromLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SyncEvent, SyncRun } from '@/types/sync'
import { PipelineStatus } from '@/types/sync'

export interface ProgressState {
  completedBatches: number
  processedRows: number
  totalRows: number
  errors: number
  skipped: number
  currentTable: string
  tableIndex: number
  totalTables: number
  phase: 'extracting' | 'loading' | 'done' | 'idle'
  elapsedMs: number
  estimatedMs: number
}

export interface MiniLog {
  type: 'batch' | 'error' | 'phase'
  table: string
  message: string
  time: Date
}

interface SyncProgressProps {
  run: SyncRun
  progress: ProgressState
  logs: MiniLog[]
  onProgressChange: (state: ProgressState | ((prev: ProgressState) => ProgressState)) => void
  onLogsChange: (logs: MiniLog[] | ((prev: MiniLog[]) => MiniLog[])) => void
  onEvent?: (event: SyncEvent) => void
}

export const createInitialProgress = (run: SyncRun): ProgressState => ({
  completedBatches: 0,
  processedRows: run.processed_rows,
  totalRows: run.total_rows,
  errors: run.error_count,
  skipped: 0,
  currentTable: '',
  tableIndex: 0,
  totalTables: 0,
  phase: run.status === PipelineStatus.Completed ? 'done' : 'idle',
  elapsedMs: 0,
  estimatedMs: 0,
})

export function SyncProgress({ run, progress, logs, onProgressChange, onLogsChange, onEvent }: SyncProgressProps) {
  const startTime = useRef(Date.now())
  const processedAtStart = useRef(run.processed_rows)

  // Reset start time when run changes
  useEffect(() => {
    startTime.current = Date.now()
    processedAtStart.current = run.processed_rows
  }, [run.id])

  useEffect(() => {
    const unlisten = listen<SyncEvent>('sync:event', (event) => {
      const e = event.payload
      onEvent?.(e)

      if (e.TableStarted) {
        const ts = e.TableStarted!
        onProgressChange((p) => ({
          ...p,
          currentTable: ts.table,
          tableIndex: ts.table_index,
          totalTables: ts.total_tables,
          phase: 'extracting',
        }))
        onLogsChange((prev) => [
          { type: 'phase' as const, table: ts.table, message: `Tabla ${ts.table_index}/${ts.total_tables}: ${ts.table}`, time: new Date() },
          ...prev,
        ].slice(0, 10))
      } else if (e.Progress) {
        onProgressChange((p) => ({
          ...p,
          processedRows: e.Progress!.processed_rows,
          totalRows: e.Progress!.total_rows,
          errors: e.Progress!.error_count,
          phase: 'loading',
        }))
      } else if (e.BatchCompleted) {
        const batch = e.BatchCompleted!
        onProgressChange((p) => {
          const now = Date.now()
          const elapsed = now - startTime.current
          const rowsPerMs = p.processedRows / Math.max(elapsed, 1)
          const remaining = Math.max(p.totalRows - p.processedRows, 0)
          const estimated = rowsPerMs > 0 ? remaining / rowsPerMs : 0
          return {
            ...p,
            completedBatches: p.completedBatches + 1,
            processedRows: p.processedRows + batch.rows_loaded,
            skipped: p.skipped + batch.skipped,
            currentTable: batch.table,
            phase: 'loading',
            elapsedMs: elapsed,
            estimatedMs: estimated,
          }
        })
        onLogsChange((prev) => [
          { type: 'batch' as const, table: batch.table, message: `Lote ${batch.batch_number}: ${batch.rows_loaded} filas en ${batch.duration_ms}ms`, time: new Date() },
          ...prev,
        ].slice(0, 10))
      } else if (e.RowError) {
        onProgressChange((p) => ({ ...p, errors: p.errors + 1 }))
        onLogsChange((prev) => [
          { type: 'error' as const, table: e.RowError!.table, message: e.RowError!.error, time: new Date() },
          ...prev,
        ].slice(0, 10))
      } else if (e.PhaseCompleted) {
        onProgressChange((p) => ({ ...p, phase: 'done', currentTable: '', elapsedMs: Date.now() - startTime.current }))
        onLogsChange((prev) => [
          { type: 'phase' as const, table: e.PhaseCompleted!.table, message: `Completado: ${e.PhaseCompleted!.total_rows} filas`, time: new Date() },
          ...prev,
        ].slice(0, 10))
      } else if (e.Error) {
        onProgressChange((p) => ({ ...p, phase: 'done', elapsedMs: Date.now() - startTime.current }))
        onLogsChange((prev) => [
          { type: 'error' as const, table: '', message: e.Error!.message, time: new Date() },
          ...prev,
        ].slice(0, 10))
      } else if (e.Completed) {
        onProgressChange((p) => ({ ...p, phase: 'done', currentTable: '', elapsedMs: Date.now() - startTime.current }))
        onLogsChange((prev) => [
          { type: 'phase' as const, table: '', message: 'Sincronización completada', time: new Date() },
          ...prev,
        ].slice(0, 10))
      }
    })

    return () => { unlisten.then((f) => f()) }
  }, [])

  // Elapsed time ticker
  useEffect(() => {
    if (run.status !== PipelineStatus.Running) return
    const interval = setInterval(() => {
      onProgressChange((p) => ({ ...p, elapsedMs: Date.now() - startTime.current }))
    }, 1000)
    return () => clearInterval(interval)
  }, [run.status])

  const isRunning = run.status === PipelineStatus.Running
  const isCompleted = run.status === PipelineStatus.Completed
  const totalForPct = progress.totalRows > 0 ? progress.totalRows : 1
  const pct = Math.min(100, Math.round((progress.processedRows / totalForPct) * 100))

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    const secs = s % 60
    return `${h > 0 ? h + 'h ' : ''}${m % 60 > 0 || h > 0 ? (m % 60) + 'm ' : ''}${secs}s`
  }

  return (
    <div className="border border-border bg-muted/20 space-y-0 divide-y divide-border">
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        {isRunning ? (
          <div className="w-10 h-10 bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : isCompleted && progress.errors === 0 ? (
          <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
        ) : (
          <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
        )}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">
            {isRunning ? 'Sincronizando...' : isCompleted && progress.errors === 0 ? 'Completado' : 'Completado con errores'}
          </p>
          <p className="text-[var(--ch-text-10)] text-muted-foreground font-mono">{fmt(progress.elapsedMs)}</p>
        </div>
        {progress.currentTable && isRunning && (
          <div className="ml-auto flex items-center gap-2 text-[var(--ch-text-10)] text-muted-foreground">
            <Database className="w-3 h-3 animate-pulse" />
            {progress.totalTables > 0 && (
              <span className="font-bold">{progress.tableIndex}/{progress.totalTables}</span>
            )}
            {progress.currentTable}
          </div>
        )}
      </div>

      {/* Big counter */}
      <div className="p-6 flex items-center justify-center gap-6">
        <div className="text-center">
          <p className="text-4xl font-bold font-mono tabular-nums">
            {progress.processedRows.toLocaleString()}
          </p>
          <p className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground mt-1">
            de {progress.totalRows.toLocaleString()} filas
          </p>
        </div>
        <ArrowRightFromLine className="w-8 h-8 text-primary/40" />
        <div className="text-center">
          <p className={cn("text-4xl font-bold font-mono tabular-nums", progress.errors > 0 && 'text-destructive')}>
            {progress.errors}
          </p>
          <p className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground mt-1">
            errores
          </p>
        </div>
        {progress.skipped > 0 && (
          <div className="text-center">
            <p className="text-4xl font-bold font-mono tabular-nums text-amber-600">
              {progress.skipped}
            </p>
            <p className="text-[var(--ch-text-10)] font-bold uppercase tracking-widest text-muted-foreground mt-1">
              omitidas
            </p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-4">
        <div className="h-3 bg-muted border border-border overflow-hidden relative">
          <div
            className={cn(
              "h-full transition-all duration-500 ease-out",
              isRunning && 'bg-primary',
              !isRunning && progress.errors === 0 && 'bg-emerald-500',
              !isRunning && progress.errors > 0 && 'bg-amber-500',
            )}
            style={{ width: `${isCompleted ? 100 : Math.max(pct, 2)}%` }}
          />
          {/* Animated stripe effect while running */}
          {isRunning && (
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
            </div>
          )}
        </div>
        <div className="flex justify-between mt-1 text-[var(--ch-text-9)] text-muted-foreground font-mono">
          <span>{pct}%</span>
          {isRunning && progress.estimatedMs > 0 && (
            <span>~{fmt(progress.estimatedMs)} restantes</span>
          )}
        </div>
      </div>

      {/* Mini logs */}
      <div className="p-4">
        <p className="text-[var(--ch-text-9)] font-bold uppercase tracking-widest text-muted-foreground mb-2">Últimas operaciones</p>
        <div className="space-y-1 max-h-[120px] overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-[var(--ch-text-10)] text-muted-foreground italic">Esperando eventos...</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex items-center gap-2 text-[var(--ch-text-10)] font-mono">
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  log.type === 'batch' && 'bg-primary',
                  log.type === 'error' && 'bg-destructive',
                  log.type === 'phase' && 'bg-emerald-500',
                )} />
                <span className="text-muted-foreground shrink-0">[{log.time.toLocaleTimeString()}]</span>
                <span className={cn(
                  log.type === 'error' && 'text-destructive',
                  log.type === 'phase' && 'text-emerald-500',
                )}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
