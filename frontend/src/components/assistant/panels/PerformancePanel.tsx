import { cn } from '@/lib/utils'
import { Clock, AlertTriangle, TrendingUp, Gauge } from 'lucide-react'
import { usePerformanceStore } from '@/store/performanceStore'

export function PerformancePanel() {
  const history = usePerformanceStore((s) => s.history)
  const recent = history.slice(0, 50)
  const avgDuration = recent.length > 0
    ? Math.round(recent.reduce((a, b) => a + b.durationMs, 0) / recent.length)
    : 0
  const maxDuration = recent.length > 0 ? Math.max(...recent.map((r) => r.durationMs)) : 0
  const slowQueries = recent.filter((r) => r.durationMs > 1000)
  const totalRows = recent.reduce((a, b) => a + b.rowsReturned, 0)

  return (
    <div className="h-full overflow-auto p-4 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
          <Gauge className="w-4 h-4 text-primary" />
          Performance Insights
        </h3>
        <p className="text-xs text-muted-foreground">Query execution metrics for the current session.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
          <Clock className="w-4 h-4 text-blue-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{avgDuration}ms</p>
          <p className="text-[10px] text-muted-foreground">Avg Duration</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
          <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{maxDuration}ms</p>
          <p className="text-[10px] text-muted-foreground">Max Duration</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
          <AlertTriangle className={slowQueries.length > 0 ? 'text-amber-500' : 'text-muted-foreground'} />
          <p className="text-lg font-bold text-foreground">{slowQueries.length}</p>
          <p className="text-[10px] text-muted-foreground">Slow Queries</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border border-border text-center">
          <p className="text-lg font-bold text-foreground">{totalRows.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Total Rows</p>
        </div>
      </div>

      {slowQueries.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Slow Queries ({'>'}1s)
          </h4>
          <div className="space-y-1.5">
            {slowQueries.slice(0, 5).map((r) => (
              <div key={r.id} className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-mono text-amber-600 font-semibold">{r.durationMs}ms</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(r.executedAt).toLocaleTimeString()}</span>
                </div>
                <pre className="text-[10px] font-mono text-muted-foreground truncate">{r.sql}</pre>
              </div>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-foreground mb-2">Recent Queries</h4>
          <div className="space-y-1">
            {recent.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/30 transition-colors">
                <div className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  r.durationMs > 1000 ? 'bg-amber-500' : r.durationMs > 500 ? 'bg-yellow-500' : 'bg-emerald-500',
                )} />
                <pre className="flex-1 text-[10px] font-mono text-muted-foreground truncate">{r.sql}</pre>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">{r.durationMs}ms</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {recent.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Gauge className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-xs">No query data yet</p>
          <p className="text-[10px]">Execute some queries to see performance metrics</p>
        </div>
      )}
    </div>
  )
}


