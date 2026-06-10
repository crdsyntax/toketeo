import { useQuery } from '@tanstack/react-query'
import { Search, Database, Table, ChevronRight, RefreshCw, AlertCircle, Code, List, Layout, Table2, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface TableInfo {
  name: string
}

interface ColumnInfo {
  name: string
  type: string
  isNullable: boolean
}

interface QueryResponse {
  columns: string[]
  rows: Record<string, any>[]
  executionTime: number
}

export default function Explorer() {
  const activeConnection = useAppStore((state) => state.activeConnection)
  const [search, setSearch] = useState('')
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'columns' | 'ddl' | 'data'>('columns')
  
  // Pagination state
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)

  const { data: tables, isLoading: isLoadingTables, refetch: refetchTables } = useQuery({
    queryKey: ['tables', activeConnection?.id],
    queryFn: () => apiFetch<TableInfo[]>(`/connections/${activeConnection?.id}/schema/tables`),
    enabled: !!activeConnection,
  })

  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    queryKey: ['columns', activeConnection?.id, selectedTable],
    queryFn: () => apiFetch<ColumnInfo[]>(`/connections/${activeConnection?.id}/schema/tables/${selectedTable}/columns`),
    enabled: !!activeConnection && !!selectedTable,
  })

  const { data: ddlData, isLoading: isLoadingDDL } = useQuery({
    queryKey: ['ddl', activeConnection?.id, selectedTable],
    queryFn: () => apiFetch<{ ddl: string }>(`/connections/${activeConnection?.id}/schema/tables/${selectedTable}/ddl`),
    enabled: !!activeConnection && !!selectedTable && activeTab === 'ddl',
  })

  const { data: queryData, isLoading: isLoadingData } = useQuery({
    queryKey: ['data', activeConnection?.id, selectedTable, page, pageSize],
    queryFn: () => apiFetch<QueryResponse>(`/connections/${activeConnection?.id}/query/execute`, {
      method: 'POST',
      body: JSON.stringify({
        sql: `SELECT * FROM \`${selectedTable}\` LIMIT ${pageSize} OFFSET ${page * pageSize}`
      })
    }),
    enabled: !!activeConnection && !!selectedTable && activeTab === 'data',
  })

  const filteredTables = tables?.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))

  if (!activeConnection) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-bold">No Connection Active</h2>
          <p className="text-muted-foreground">Select a connection first to explore the schema.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* Object Explorer Sidebar */}
      <div className="w-72 flex flex-col border border-border rounded-xl bg-card overflow-hidden shrink-0">
        <div className="p-4 border-b border-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Explorer
            </h3>
            <button 
              onClick={() => refetchTables()}
              className="p-1.5 hover:bg-muted rounded-md transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoadingTables && "animate-spin")} />
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tables..." 
              className="w-full bg-muted/50 border border-border rounded-md pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" 
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {isLoadingTables ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-8 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Tables ({filteredTables?.length || 0})
              </div>
              {filteredTables?.map((table) => (
                <button
                  key={table.name}
                  onClick={() => {
                    setSelectedTable(table.name)
                    setPage(0)
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors group text-left",
                    selectedTable === table.name ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  <Table className={cn("w-3.5 h-3.5", selectedTable === table.name ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate flex-1">{table.name}</span>
                  <ChevronRight className={cn("w-3 h-3 transition-opacity", selectedTable === table.name ? "opacity-100" : "opacity-0 group-hover:opacity-100")} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail View */}
      <div className="flex-1 border border-border rounded-xl bg-card flex flex-col overflow-hidden">
        {selectedTable ? (
          <>
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-background border border-border rounded-lg">
                  <Table className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{selectedTable}</h3>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Base Table</p>
                </div>
              </div>
              
              <div className="flex bg-muted p-1 rounded-lg">
                <button 
                  onClick={() => setActiveTab('columns')}
                  className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'columns' ? "bg-background shadow-sm" : "hover:bg-background/50")}
                >
                  <List className="w-3.5 h-3.5" />
                  Columns
                </button>
                <button 
                  onClick={() => setActiveTab('data')}
                  className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'data' ? "bg-background shadow-sm" : "hover:bg-background/50")}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  Data
                </button>
                <button 
                  onClick={() => setActiveTab('ddl')}
                  className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'ddl' ? "bg-background shadow-sm" : "hover:bg-background/50")}
                >
                  <Code className="w-3.5 h-3.5" />
                  DDL
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex flex-col">
              {activeTab === 'columns' && (
                <div className="p-4">
                  {isLoadingColumns ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
                    </div>
                  ) : (
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="pb-2 font-medium">Name</th>
                          <th className="pb-2 font-medium">Type</th>
                          <th className="pb-2 font-medium text-right">Nullable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {columns?.map((col) => (
                          <tr key={col.name} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="py-3 font-medium text-foreground">{col.name}</td>
                            <td className="py-3 font-mono text-xs text-muted-foreground uppercase tracking-tighter">{col.type}</td>
                            <td className="py-3 text-right">
                              <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", col.isNullable ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive")}>
                                {col.isNullable ? 'Yes' : 'No'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'data' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-auto">
                    {isLoadingData ? (
                       <div className="p-4 space-y-4">
                         {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
                       </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 bg-background border-b border-border z-10">
                          <tr>
                            {queryData?.columns.map(col => (
                              <th key={col} className="p-2 font-bold bg-muted/50 truncate border-r border-border last:border-0">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryData?.rows.map((row, i) => (
                            <tr key={i} className="border-b border-border/50 hover:bg-muted/30 whitespace-nowrap">
                              {queryData.columns.map(col => (
                                <td key={col} className="p-2 border-r border-border last:border-0 truncate max-w-[200px]">
                                  {row[col] === null ? <span className="text-muted-foreground italic text-[10px]">NULL</span> : String(row[col])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  
                  {/* Pagination Footer */}
                  <div className="p-3 border-t border-border flex items-center justify-between bg-muted/10">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Rows: <span className="font-bold text-foreground">{queryData?.rows.length || 0}</span></span>
                      <span>Execution: <span className="font-bold text-foreground">{queryData?.executionTime || 0}ms</span></span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                       <select 
                         value={pageSize}
                         onChange={(e) => setPageSize(Number(e.target.value))}
                         className="text-[10px] bg-background border border-border rounded px-2 py-1 outline-none"
                       >
                         <option value={10}>10</option>
                         <option value={50}>50</option>
                         <option value={100}>100</option>
                       </select>
                       
                       <div className="flex items-center gap-1 ml-4">
                         <button 
                           disabled={page === 0}
                           onClick={() => setPage(p => Math.max(0, p - 1))}
                           className="p-1 hover:bg-muted rounded border border-border disabled:opacity-30"
                         >
                           <ChevronLeft className="w-4 h-4" />
                         </button>
                         <span className="text-[10px] font-bold px-2">{page + 1}</span>
                         <button 
                           disabled={(queryData?.rows.length || 0) < pageSize}
                           onClick={() => setPage(p => p + 1)}
                           className="p-1 hover:bg-muted rounded border border-border disabled:opacity-30"
                         >
                           <ChevronRightIcon className="w-4 h-4" />
                         </button>
                       </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'ddl' && (
                <div className="h-full bg-muted/30 p-4 font-mono text-xs overflow-auto">
                  {isLoadingDDL ? (
                    <div className="space-y-2">
                       {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-4 bg-muted animate-pulse rounded" />)}
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap break-all text-primary">
                      {ddlData?.ddl}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
              <Layout className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">Object Detail</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Select an item from the sidebar to view its structure and definition.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
