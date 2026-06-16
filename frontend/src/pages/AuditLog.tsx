import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Search, Clock, Database, Activity, AlertCircle, CheckCircle2 } from 'lucide-react'
import { auditService } from '@/services/audit.service'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export default function AuditLog() {
  const [limit] = useState(50)
  const [offset] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')

  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['audit-logs', limit, offset],
    queryFn: () => auditService.getLogs(limit, offset),
  })

  const filteredLogs = logs?.filter(log => 
    log.query.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.connection_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.status.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground mt-1">Track all database queries and executions.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-border hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input 
          type="text"
          placeholder="Search by query, connection or status..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-muted/30 border border-border rounded-md pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none transition-all"
        />
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Timestamp</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Connection ID</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Execution Time</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Query</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-4 py-4"><div className="h-4 bg-muted rounded w-full"></div></td>
                  </tr>
                ))
              ) : filteredLogs?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground italic">
                    No audit records found.
                  </td>
                </tr>
              ) : (
                filteredLogs?.map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium">
                        <Database className="w-3.5 h-3.5 text-primary" />
                        {log.connection_id.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {log.status === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                        )}
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                          log.status === 'success' 
                            ? "text-green-500 bg-green-500/10 border-green-500/20" 
                            : "text-red-500 bg-red-500/10 border-red-500/20"
                        )}>
                          {log.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5" />
                        {log.execution_time_ms}ms
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-md">
                        <code className="text-[11px] font-mono bg-muted/50 px-1.5 py-0.5 rounded block truncate group-hover:whitespace-normal group-hover:overflow-visible transition-all">
                          {log.query}
                        </code>
                        {log.error && (
                          <p className="text-[10px] text-red-500 mt-1 truncate group-hover:whitespace-normal group-hover:overflow-visible">
                            {log.error}
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
