import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Search, Clock, Database, Activity, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import { auditService } from '@/services/audit.service'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

export default function AuditLog() {
  const [page, setPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')

  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['audit-logs', PAGE_SIZE, page * PAGE_SIZE],
    queryFn: () => auditService.getLogs(PAGE_SIZE, page * PAGE_SIZE),
  })

  const filteredLogs = logs?.filter(log => 
    log.query.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.connection_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.status.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const hasMore = (logs?.length ?? 0) >= PAGE_SIZE

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
      {/* Header */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground">Track all database queries and executions.</p>
        </div>
        <button 
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input 
          type="text"
          placeholder="Search by query, connection or status..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-muted border border-border rounded-md pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none transition-all"
        />
      </div>

      {/* Table container */}
      <div className="flex-1 min-h-0 flex flex-col border border-border rounded-md bg-surface shadow-sm overflow-hidden">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="border-b border-border">
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[var(--ch-text-9)] text-muted-foreground whitespace-nowrap">Timestamp</th>
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[var(--ch-text-9)] text-muted-foreground whitespace-nowrap">Connection</th>
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[var(--ch-text-9)] text-muted-foreground whitespace-nowrap">Status</th>
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[var(--ch-text-9)] text-muted-foreground whitespace-nowrap">Time</th>
                <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[var(--ch-text-9)] text-muted-foreground">Query</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-3 py-3"><div className="h-4 bg-muted rounded w-full"></div></td>
                  </tr>
                ))
              ) : filteredLogs?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground italic">
                    No audit records found.
                  </td>
                </tr>
              ) : (
                filteredLogs?.map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <Clock className="w-3 h-3 shrink-0" />
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-medium text-xs">
                        <Database className="w-3 h-3 text-primary shrink-0" />
                        {log.connection_id.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {log.status === 'success' ? (
                          <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                        )}
                        <span className={cn(
                          "text-[var(--ch-text-9)] font-semibold uppercase px-1 py-0.5 rounded border text-xs",
                          log.status === 'success' 
                            ? "text-green-500 bg-green-500/10 border-green-500/20" 
                            : "text-red-500 bg-red-500/10 border-red-500/20"
                        )}>
                          {log.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground text-xs">
                      <div className="flex items-center gap-1">
                        <Activity className="w-3 h-3 shrink-0" />
                        {log.execution_time_ms}ms
                      </div>
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      <code className="text-[var(--ch-text-10)] font-mono bg-muted px-1.5 py-0.5 rounded block truncate text-xs">
                        {log.query}
                      </code>
                      {log.error && (
                        <p className="text-[var(--ch-text-9)] text-red-500 mt-0.5 truncate text-xs">
                          {log.error}
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/20 shrink-0">
          <span className="text-[var(--ch-text-9)] text-muted-foreground text-xs">
            Page {page + 1}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-3 h-3" />
              Previous
            </button>
            <button
              disabled={!hasMore}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-30"
            >
              Next
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
