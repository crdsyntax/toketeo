import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Database, Table, ChevronRight, RefreshCw, AlertCircle, Code, List, Layout, Table2, ChevronLeft, ChevronRight as ChevronRightIcon, Play, Square, Loader2, Save, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { io, Socket } from 'socket.io-client'
import { format } from 'sql-formatter'
import { Editor } from '@monaco-editor/react'

interface TableInfo {
  name: string
}

interface ColumnInfo {
  name: string
  type: string
  isNullable: boolean
}

interface ParameterInfo {
  name: string
  type: string
  mode: 'IN' | 'OUT' | 'INOUT'
}

interface QueryResponse {
  columns: string[]
  rows: Record<string, any>[]
  executionTime: number
}

export default function Explorer() {
  const { activeConnection, setActiveConnectionDatabase } = useAppStore()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<{ name: string, type: 'table' | 'view' | 'procedure' | 'trigger' | 'schema' } | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'tables' | 'views' | 'procedures' | 'triggers' | 'schemas'>('tables')
  const [activeTab, setActiveTab] = useState<'columns' | 'ddl' | 'data'>('columns')
  const [currentSchema, setCurrentDatabase] = useState(activeConnection?.database || '')
  
  useEffect(() => {
    if (activeConnection?.database) {
      setCurrentDatabase(activeConnection.database)
    }
  }, [activeConnection])

  // Pagination state
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  
  const socketRef = useRef<Socket | null>(null)
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle')
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [socketResults, setSocketResults] = useState<QueryResponse | null>(null)
  
  const [editableDdl, setEditableDdl] = useState('')
  const [paramValues, setParamsValues] = useState<Record<string, string>>({})
  const [showParamModal, setShowParamModal] = useState(false)

  useEffect(() => {
    const socket = io(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/queries`)
    socketRef.current = socket

    socket.on('query-progress', () => {
      setExecutionStatus('executing')
    })

    socket.on('query-result', (data: any) => {
      if (data.tabId === 'explorer') {
        setSocketResults({
          columns: data.columns,
          rows: data.rows,
          executionTime: data.executionTime
        })
        setExecutionStatus('success')
        setExecutionError(null)
      }
    })

    socket.on('query-error', (data: any) => {
      if (data.tabId === 'explorer') {
        setExecutionStatus('error')
        setExecutionError(data.message)
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const { data: tables, isLoading: isLoadingTables, refetch: refetchTables } = useQuery({
    queryKey: ['tables', activeConnection?.id, currentSchema],
    queryFn: () => apiFetch<TableInfo[]>(`/connections/${activeConnection?.id}/schema/tables?schema=${currentSchema}`),
    enabled: !!activeConnection,
  })

  const { data: views, isLoading: isLoadingViews, refetch: refetchViews } = useQuery({
    queryKey: ['views', activeConnection?.id, currentSchema],
    queryFn: () => apiFetch<TableInfo[]>(`/connections/${activeConnection?.id}/schema/views?schema=${currentSchema}`),
    enabled: !!activeConnection,
  })

  const { data: procedures, isLoading: isLoadingProcedures, refetch: refetchProcedures } = useQuery({
    queryKey: ['procedures', activeConnection?.id, currentSchema],
    queryFn: () => apiFetch<TableInfo[]>(`/connections/${activeConnection?.id}/schema/procedures?schema=${currentSchema}`),
    enabled: !!activeConnection,
  })

  const { data: triggers, isLoading: isLoadingTriggers, refetch: refetchTriggers } = useQuery({
    queryKey: ['triggers', activeConnection?.id, currentSchema],
    queryFn: () => apiFetch<TableInfo[]>(`/connections/${activeConnection?.id}/schema/triggers?schema=${currentSchema}`),
    enabled: !!activeConnection,
  })

  const { data: schemas, isLoading: isLoadingSchemas, refetch: refetchSchemas } = useQuery({
    queryKey: ['schemas', activeConnection?.id],
    queryFn: () => apiFetch<string[]>(`/connections/${activeConnection?.id}/schema/schemas`),
    enabled: !!activeConnection,
  })

  const switchSchemaMutation = useMutation({
    mutationFn: (schema: string) => apiFetch(`/connections/${activeConnection?.id}/schema/switch-schema`, {
      method: 'POST',
      body: JSON.stringify({ schema })
    }),
    onSuccess: (_, schema) => {
      setActiveConnectionDatabase(schema)
      queryClient.invalidateQueries({ queryKey: ['tables', activeConnection?.id] })
      queryClient.invalidateQueries({ queryKey: ['views', activeConnection?.id] })
      queryClient.invalidateQueries({ queryKey: ['procedures', activeConnection?.id] })
      queryClient.invalidateQueries({ queryKey: ['triggers', activeConnection?.id] })
      setSelectedItem(null)
      setSidebarTab('tables')
    }
  })

  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    queryKey: ['columns', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => apiFetch<ColumnInfo[]>(`/connections/${activeConnection?.id}/schema/tables/${selectedItem?.name}/columns?schema=${currentSchema}`),
    enabled: !!activeConnection && !!selectedItem && (selectedItem.type === 'table' || selectedItem.type === 'view'),
  })

  const { data: ddlData, isLoading: isLoadingDDL } = useQuery({
    queryKey: ['ddl', activeConnection?.id, selectedItem, currentSchema],
    queryFn: async () => {
      const data = await apiFetch<{ ddl: string }>(`/connections/${activeConnection?.id}/schema/objects/${selectedItem?.name}/ddl?type=${selectedItem?.type}&schema=${currentSchema}`)
      let formatted = data.ddl
      try {
        formatted = format(data.ddl, { language: 'mysql', uppercase: true })
      } catch (e) {
        // ignore format error
      }
      setEditableDdl(formatted)
      return { ddl: formatted }
    },
    enabled: !!activeConnection && !!selectedItem && activeTab === 'ddl',
  })

  const { data: parameters, isLoading: isLoadingParams } = useQuery({
    queryKey: ['parameters', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => apiFetch<ParameterInfo[]>(`/connections/${activeConnection?.id}/schema/objects/${selectedItem?.name}/parameters?type=${selectedItem?.type}&schema=${currentSchema}`),
    enabled: !!activeConnection && !!selectedItem && (selectedItem.type === 'procedure' || selectedItem.type === 'view'),
  })

  const updateDdlMutation = useMutation({
    mutationFn: (sql: string) => apiFetch(`/connections/${activeConnection?.id}/schema/objects/${selectedItem?.name}/ddl?type=${selectedItem?.type}&schema=${currentSchema}`, {
      method: 'POST',
      body: JSON.stringify({ sql })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ddl', activeConnection?.id, selectedItem] })
      handleRefetch()
    }
  })

  const handleExecute = useCallback((useParams: boolean = false) => {
    if (selectedItem && activeConnection && socketRef.current) {
      if (!useParams && parameters && parameters.length > 0) {
        setShowParamModal(true)
        return
      }

      let sql = ''
      const params: any[] = []

      if (selectedItem.type === 'view' || selectedItem.type === 'table') {
        sql = `SELECT * FROM \`${selectedItem.name}\` LIMIT ${pageSize} OFFSET ${page * pageSize};`
      } else if (selectedItem.type === 'procedure') {
        const placeholders = parameters?.map(p => {
          params.push(paramValues[p.name] || null)
          return '?'
        }).join(', ') || ''
        sql = `CALL \`${selectedItem.name}\`(${placeholders});`
      }

      if (!sql) return

      setExecutionStatus('executing')
      setExecutionError(null)
      setSocketResults(null)
      setShowParamModal(false)

      socketRef.current.emit('execute-query', {
        connectionId: activeConnection.id,
        dto: { sql, params, schema: currentSchema },
        tabId: 'explorer'
      })
    }
  }, [selectedItem, activeConnection, pageSize, page, parameters, paramValues, currentSchema])

  useEffect(() => {
    if (selectedItem?.type === 'table' && activeTab === 'data' && executionStatus === 'idle') {
      handleExecute()
    }
  }, [selectedItem, activeTab, executionStatus, handleExecute])

  const handleCancel = () => {
    if (socketRef.current && activeConnection) {
      socketRef.current.emit('cancel-query', { 
        tabId: 'explorer',
        connectionId: activeConnection.id 
      })
      setExecutionStatus('error')
      setExecutionError('Query cancelled by user')
    }
  }

  const queryData = socketResults
  const isLoadingData = executionStatus === 'executing'

  const getFilteredItems = () => {
    if (sidebarTab === 'schemas') return schemas?.filter(s => s.toLowerCase().includes(search.toLowerCase())).map(s => ({ name: s }))
    const items = sidebarTab === 'tables' ? tables : 
                 sidebarTab === 'views' ? views : 
                 sidebarTab === 'procedures' ? procedures : triggers;
    return items?.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
  }

  const filteredItems = getFilteredItems()

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

  const handleRefetch = () => {
    if (sidebarTab === 'tables') refetchTables()
    else if (sidebarTab === 'views') refetchViews()
    else if (sidebarTab === 'procedures') refetchProcedures()
    else if (sidebarTab === 'triggers') refetchTriggers()
    else if (sidebarTab === 'schemas') refetchSchemas()
  }

  const isLoadingSidebar = isLoadingTables || isLoadingViews || isLoadingProcedures || isLoadingTriggers || isLoadingSchemas

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 relative">
      {showParamModal && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
              <h4 className="font-bold flex items-center gap-2">
                <Code className="w-4 h-4 text-primary" />
                Execution Parameters
              </h4>
              <button onClick={() => setShowParamModal(false)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground">Provide the required parameters to execute <b>{selectedItem?.name}</b>.</p>
              {parameters?.map(p => (
                <div key={p.name} className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
                    {p.name} <span className="text-primary/70">{p.type} ({p.mode})</span>
                  </label>
                  <input 
                    type="text"
                    value={paramValues[p.name] || ''}
                    onChange={(e) => setParamsValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder={`Enter value for ${p.name}...`}
                  />
                </div>
              ))}
              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setShowParamModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-bold hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleExecute(true)}
                  className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Execute
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="w-80 flex border border-border rounded-xl bg-card overflow-hidden shrink-0">
        <div className="w-12 flex flex-col items-center py-4 gap-4 border-r border-border bg-muted/20">
          <button onClick={() => setSidebarTab('tables')} title="Tables" className={cn("p-2 rounded-lg transition-colors", sidebarTab === 'tables' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
            <Table className="w-5 h-5" />
          </button>
          <button onClick={() => setSidebarTab('views')} title="Views" className={cn("p-2 rounded-lg transition-colors", sidebarTab === 'views' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
            <Layout className="w-5 h-5" />
          </button>
          <button onClick={() => setSidebarTab('procedures')} title="Procedures" className={cn("p-2 rounded-lg transition-colors", sidebarTab === 'procedures' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
            <Code className="w-5 h-5" />
          </button>
          <button onClick={() => setSidebarTab('triggers')} title="Triggers" className={cn("p-2 rounded-lg transition-colors", sidebarTab === 'triggers' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
            <RefreshCw className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <button onClick={() => setSidebarTab('schemas')} title="Databases / Schemas" className={cn("p-2 rounded-lg transition-colors", sidebarTab === 'schemas' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted")}>
            <Database className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-4 border-b border-border space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex flex-col gap-0.5 text-xs">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{currentSchema}</span>
                <div className="flex items-center gap-2">
                  <Database className="w-3 h-3 text-primary" />
                  {sidebarTab.charAt(0).toUpperCase() + sidebarTab.slice(1)}
                </div>
              </h3>
              <button onClick={handleRefetch} className="p-1.5 hover:bg-muted rounded-md transition-colors">
                <RefreshCw className={cn("w-3.5 h-3.5", isLoadingSidebar && "animate-spin")} />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${sidebarTab}...`} className="w-full bg-muted/50 border border-border rounded-md pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {isLoadingSidebar ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Results ({filteredItems?.length || 0})</div>
                {filteredItems?.map((item) => (
                  <button key={item.name} onClick={() => {
                    if (sidebarTab === 'schemas') {
                      switchSchemaMutation.mutate(item.name)
                      return
                    }
                    const type = sidebarTab === 'tables' ? 'table' : sidebarTab === 'views' ? 'view' : sidebarTab === 'procedures' ? 'procedure' : 'trigger';
                    setSelectedItem({ name: item.name, type })
                    setPage(0)
                    setSocketResults(null)
                    setExecutionStatus('idle')
                    setExecutionError(null)
                    setParamsValues({})
                    setActiveTab(type === 'table' ? 'columns' : 'ddl')
                  }} className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors group text-left", 
                    (selectedItem?.name === item.name || currentSchema === item.name) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  )}>
                    {sidebarTab === 'tables' && <Table className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
                    {sidebarTab === 'views' && <Layout className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
                    {sidebarTab === 'procedures' && <Code className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
                    {sidebarTab === 'triggers' && <RefreshCw className={cn("w-3.5 h-3.5", selectedItem?.name === item.name ? "text-primary" : "text-muted-foreground")} />}
                    {sidebarTab === 'schemas' && <Database className={cn("w-3.5 h-3.5", currentSchema === item.name ? "text-primary" : "text-muted-foreground")} />}
                    <span className="truncate flex-1">{item.name}</span>
                    <ChevronRight className={cn("w-3 h-3 transition-opacity", (selectedItem?.name === item.name || currentSchema === item.name) ? "opacity-100" : "opacity-0 group-hover:opacity-100")} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 border border-border rounded-xl bg-card flex flex-col overflow-hidden">
        {selectedItem ? (
          <>
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-background border border-border rounded-lg">
                  {selectedItem.type === 'table' && <Table className="w-5 h-5 text-primary" />}
                  {selectedItem.type === 'view' && <Layout className="w-5 h-5 text-primary" />}
                  {selectedItem.type === 'procedure' && <Code className="w-5 h-5 text-primary" />}
                  {selectedItem.type === 'trigger' && <RefreshCw className="w-5 h-5 text-primary" />}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{selectedItem.name}</h3>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{selectedItem.type}</p>
                </div>
              </div>
              <div className="flex bg-muted p-1 rounded-lg">
                {(selectedItem.type === 'table' || selectedItem.type === 'view' || selectedItem.type === 'procedure') && (
                  <>
                    {(selectedItem.type === 'table' || selectedItem.type === 'view') && (
                      <button onClick={() => setActiveTab('columns')} className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'columns' ? "bg-background shadow-sm" : "hover:bg-background/50")}>
                        <List className="w-3.5 h-3.5" />Columns
                      </button>
                    )}
                    <button onClick={() => setActiveTab('data')} className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'data' ? "bg-background shadow-sm" : "hover:bg-background/50")}>
                      <Table2 className="w-3.5 h-3.5" />{selectedItem.type === 'procedure' ? 'Execution' : 'Data'}
                    </button>
                  </>
                )}
                <button onClick={() => setActiveTab('ddl')} className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'ddl' ? "bg-background shadow-sm" : "hover:bg-background/50")}>
                  <Code className="w-3.5 h-3.5" />Definition
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex flex-col">
              {activeTab === 'columns' && (selectedItem.type === 'table' || selectedItem.type === 'view') && (
                <div className="p-4">
                  {isLoadingColumns ? (
                    <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
                  ) : (
                    <table className="w-full text-left text-sm border-collapse">
                      <thead><tr className="border-b border-border text-muted-foreground"><th className="pb-2 font-medium">Name</th><th className="pb-2 font-medium">Type</th><th className="pb-2 font-medium text-right">Nullable</th></tr></thead>
                      <tbody>
                        {columns?.map((col) => (
                          <tr key={col.name} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="py-3 font-medium text-foreground">{col.name}</td>
                            <td className="py-3 font-mono text-xs text-muted-foreground uppercase tracking-tighter">{col.type}</td>
                            <td className="py-3 text-right"><span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", col.isNullable ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive")}>{col.isNullable ? 'Yes' : 'No'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'data' && (selectedItem.type === 'table' || selectedItem.type === 'view' || selectedItem.type === 'procedure') && (
                <div className="flex-1 flex flex-col min-h-0">
                  {((selectedItem.type === 'view' || selectedItem.type === 'procedure') && executionStatus === 'idle') ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                      {selectedItem.type === 'view' ? <Layout className="w-12 h-12 text-muted-foreground mb-4" /> : <Code className="w-12 h-12 text-muted-foreground mb-4" />}
                      <h4 className="font-bold mb-2">{selectedItem.type === 'view' ? 'View Data' : 'Execute Procedure'}</h4>
                      <p className="text-sm text-muted-foreground mb-6 max-w-xs">{selectedItem.type === 'view' ? 'Viewing data from a view may take time.' : 'Executing a procedure will run its code on the server.'} Click the button to proceed via WebSocket.</p>
                      <button onClick={() => handleExecute()} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold hover:bg-primary/90 transition-colors flex items-center gap-2">
                        <Play className="w-4 h-4 fill-current" />{selectedItem.type === 'view' ? 'Execute View' : 'Run Procedure'}
                      </button>
                    </div>
                  ) : (
                    <>
                      {executionStatus === 'error' && (
                        <div className="p-4 bg-destructive/10 border-b border-destructive/20 text-destructive flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" /><p className="text-xs font-mono">{executionError}</p>
                          <button onClick={() => setExecutionStatus('idle')} className="ml-auto p-1 hover:bg-destructive/20 rounded"><X className="w-3 h-3" /></button>
                        </div>
                      )}
                      <div className="flex-1 overflow-auto">
                        {isLoadingData ? (
                          <div className="p-4 space-y-4">
                            <div className="flex items-center gap-2 text-primary animate-pulse mb-4">
                              <Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs font-bold uppercase tracking-widest">Executing via WebSocket...</span>
                              <button onClick={handleCancel} className="ml-auto bg-destructive/10 text-destructive border border-destructive/20 px-3 py-1 rounded text-[10px] font-bold hover:bg-destructive/20 transition-colors">Stop</button>
                            </div>
                            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
                          </div>
                        ) : queryData ? (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="sticky top-0 bg-background border-b border-border z-10">
                              <tr>{queryData.columns.map(col => <th key={col} className="p-2 font-bold bg-muted/50 truncate border-r border-border last:border-0">{col}</th>)}</tr>
                            </thead>
                            <tbody>
                              {queryData.rows.map((row, i) => (
                                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 whitespace-nowrap">
                                  {queryData.columns.map(col => <td key={col} className="p-2 border-r border-border last:border-0 truncate max-w-[200px]">{row[col] === null ? <span className="text-muted-foreground italic text-[10px]">NULL</span> : String(row[col])}</td>)}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : executionStatus === 'success' && <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">Query executed successfully but returned no data.</div>}
                      </div>
                      {queryData && (
                        <div className="p-3 border-t border-border flex items-center justify-between bg-muted/10">
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Rows: <span className="font-bold text-foreground">{queryData.rows.length}</span></span>
                            <span>Execution: <span className="font-bold text-foreground">{queryData.executionTime}ms</span></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="text-[10px] bg-background border border-border rounded px-2 py-1 outline-none">
                              <option value={10}>10</option><option value={50}>50</option><option value={100}>100</option>
                            </select>
                            <div className="flex items-center gap-1 ml-4">
                              <button disabled={page === 0} onClick={() => { setPage(p => Math.max(0, p - 1)); setExecutionStatus('idle') }} className="p-1 hover:bg-muted rounded border border-border disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                              <span className="text-[10px] font-bold px-2">{page + 1}</span>
                              <button disabled={queryData.rows.length < pageSize} onClick={() => { setPage(p => p + 1); setExecutionStatus('idle') }} className="p-1 hover:bg-muted rounded border border-border disabled:opacity-30"><ChevronRightIcon className="w-4 h-4" /></button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === 'ddl' && (
                <div className="flex-1 flex flex-col bg-muted/30 relative">
                  <div className="p-2 border-b border-border bg-background/50 flex justify-between items-center px-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Definition Editor</span>
                    <button onClick={() => updateDdlMutation.mutate(editableDdl)} disabled={updateDdlMutation.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1 rounded-md text-[10px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
                      {updateDdlMutation.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Save className="w-2.5 h-2.5" />}
                      {updateDdlMutation.isPending ? 'Saving...' : 'Apply Changes'}
                    </button>
                  </div>
                  <div className="flex-1">
                    {isLoadingDDL ? (
                      <div className="p-4 space-y-2">{[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-4 bg-muted animate-pulse rounded" />)}</div>
                    ) : (
                      <Editor height="100%" defaultLanguage="sql" theme="vs-dark" value={editableDdl} onChange={(val) => setEditableDdl(val || '')} options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 16 } }} />
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4"><Layout className="w-8 h-8 text-muted-foreground" /></div>
            <h3 className="text-lg font-medium">Object Detail</h3>
            <p className="text-sm text-muted-foreground max-w-xs">Select an item from the sidebar to view its structure and definition.</p>
          </div>
        )}
      </div>
    </div>
  )
}
