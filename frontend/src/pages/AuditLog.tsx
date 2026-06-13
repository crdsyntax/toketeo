import { useQuery } from '@tanstack/react-query'
import { Download, RefreshCw, Search, Clock, User, Activity } from 'lucide-react'
import { getApiUrl } from '@/lib/api'
import { auditService } from '@/services/audit.service'
import { AuditAction } from '@/types/audit'
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
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.resource.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.userId.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getActionColor = (action: AuditAction) => {
    switch (action) {
      case AuditAction.DELETE_CONNECTION: return 'text-red-500 bg-red-500/10 border-red-500/20'
      case AuditAction.CREATE_CONNECTION: return 'text-green-500 bg-green-500/10 border-green-500/20'
      case AuditAction.EXECUTE_QUERY: return 'text-blue-500 bg-blue-500/10 border-blue-500/20'
      case AuditAction.SCHEMA_CHANGE: return 'text-orange-500 bg-orange-500/10 border-orange-500/20'
      default: return 'text-muted-foreground bg-muted/50 border-border'
    }
  }

  const handleExport = (type: 'json' | 'csv') => {
    window.open(getApiUrl(`/audit/export/${type}`), '_blank')
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground mt-1">Track all administrative and database actions.</p>
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
          <div className="flex rounded-md border border-border overflow-hidden">
            <button 
              onClick={() => handleExport('csv')}
              className="flex items-center gap-2 px-3 py-2 bg-background hover:bg-muted transition-colors text-sm font-medium border-r border-border"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button 
              onClick={() => handleExport('json')}
              className="flex items-center gap-2 px-3 py-2 bg-background hover:bg-muted transition-colors text-sm font-medium"
            >
              JSON
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input 
          type="text"
          placeholder="Search by action, user or resource..."
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
                <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">User</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Action</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Resource</th>
                <th className="px-4 py-3 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">ID</th>
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
                filteredLogs?.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-3 h-3 text-primary" />
                        </div>
                        {log.userId}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase border", getActionColor(log.action))}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                        {log.resource}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                      {log.resourceId || '-'}
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
