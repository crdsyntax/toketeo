import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Database, Table, ChevronRight, RefreshCw, AlertCircle, Code, List, Layout, Table2, ChevronLeft, ChevronRight as ChevronRightIcon, Play, Square, Loader2, Save, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { io, Socket } from 'socket.io-client'
import { format } from 'sql-formatter'
import { Sidebar } from '@/components/explorer/Sidebar'
import { ObjectDetail } from '@/components/explorer/ObjectDetail'

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
  const { activeConnection } = useAppStore()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<{ name: string, type: 'table' | 'view' | 'procedure' | 'trigger' } | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'tables' | 'views' | 'procedures' | 'triggers'>('tables')
  const [activeTab, setActiveTab] = useState<'columns' | 'data' | 'ddl'>('columns')
  const [currentSchema, setCurrentSchema] = useState(activeConnection?.database || '')

  useEffect(() => {
    if (activeConnection?.database) {
      setCurrentSchema(activeConnection.database)
      setSelectedItem(null)
    }
  }, [activeConnection?.database])
  
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
        formatted = format(data.ddl, { language: 'mysql' })
      } catch (e) {
        // ignore format error
      }
      setEditableDdl(formatted)
      return { ddl: formatted }
    },
    enabled: !!activeConnection && !!selectedItem && activeTab === 'ddl',
  })

  const { data: parameters } = useQuery({
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

  const getFilteredItems = () => {
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
  }

  const isLoadingSidebar = isLoadingTables || isLoadingViews || isLoadingProcedures || isLoadingTriggers

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 relative">
      {showParamModal && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-left">
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

      <Sidebar 
        sidebarTab={sidebarTab}
        setSidebarTab={setSidebarTab}
        currentSchema={currentSchema}
        handleRefetch={handleRefetch}
        isLoadingSidebar={isLoadingSidebar}
        search={search}
        setSearch={setSearch}
        filteredItems={filteredItems || []}
        selectedItem={selectedItem}
        setSelectedItem={setSelectedItem}
        setPage={setPage}
        setSocketResults={setSocketResults}
        setExecutionStatus={setExecutionStatus}
        setExecutionError={setExecutionError}
        setParamsValues={setParamsValues}
        setActiveTab={setActiveTab}
      />

      <div className="flex-1 border border-border rounded-xl bg-card flex flex-col overflow-hidden">
        <ObjectDetail 
          selectedItem={selectedItem}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          columns={columns}
          isLoadingColumns={isLoadingColumns}
          isLoadingData={executionStatus === 'executing'}
          executionStatus={executionStatus}
          executionError={executionError}
          queryData={socketResults}
          pageSize={pageSize}
          setPageSize={setPageSize}
          page={page}
          setPage={setPage}
          handleExecute={handleExecute}
          handleCancel={handleCancel}
          isLoadingDDL={isLoadingDDL}
          editableDdl={editableDdl}
          setEditableDdl={setEditableDdl}
          updateDdlMutation={updateDdlMutation}
        />
      </div>
    </div>
  )
}
