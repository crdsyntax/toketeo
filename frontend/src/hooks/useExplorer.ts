import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { io, Socket } from 'socket.io-client'
import { format } from 'sql-formatter'
import { apiFetch } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import type { DatabaseObject, ColumnResponse, QueryResult, DbValue, DbRow } from '@/types/database'

export interface TableInfo {
  name: string
  schema?: string
  type: string
}

export interface ColumnInfo extends ColumnResponse {}

export interface ParameterInfo {
  name: string
  type: string
  mode: 'IN' | 'OUT' | 'INOUT'
}

export function useExplorer() {
  const { activeConnection } = useAppStore()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<DatabaseObject | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'tables' | 'views' | 'procedures' | 'triggers'>('tables')
  const [activeTab, setActiveTab] = useState<'columns' | 'data' | 'ddl' | 'indexes' | 'foreign-keys' | 'constraints'>('columns')
  const currentSchema = activeConnection?.database || ''

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  
  const socketRef = useRef<Socket | null>(null)
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle')
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [socketResults, setSocketResults] = useState<QueryResult | null>(null)
  
  const [editableDdl, setEditableDdl] = useState('')
  const [paramValues, setParamsValues] = useState<Record<string, string>>({})
  const [showParamModal, setShowParamModal] = useState(false)

  // Reset selection when connection or schema changes
  useEffect(() => {
    setSelectedItem(null)
  }, [activeConnection?.id, currentSchema])

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['tables', activeConnection?.id] })
    queryClient.invalidateQueries({ queryKey: ['views', activeConnection?.id] })
    queryClient.invalidateQueries({ queryKey: ['procedures', activeConnection?.id] })
    queryClient.invalidateQueries({ queryKey: ['triggers', activeConnection?.id] })
  }, [currentSchema, activeConnection?.id, queryClient])

  useEffect(() => {
    const socket = io(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/queries`)
    socketRef.current = socket

    socket.on('query-progress', () => {
      setExecutionStatus('executing')
    })

    socket.on('query-result', (data: { tabId: string, columns: string[], rows: DbRow[], executionTime: number }) => {
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

    socket.on('query-error', (data: { tabId: string, message: string }) => {
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

  const handleRefetch = useCallback(() => {
    if (sidebarTab === 'tables') refetchTables()
    else if (sidebarTab === 'views') refetchViews()
    else if (sidebarTab === 'procedures') refetchProcedures()
    else if (sidebarTab === 'triggers') refetchTriggers()
  }, [sidebarTab, refetchTables, refetchViews, refetchProcedures, refetchTriggers])

  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    queryKey: ['columns', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => apiFetch<ColumnInfo[]>(`/connections/${activeConnection?.id}/schema/tables/${selectedItem?.name}/columns?schema=${currentSchema}`),
    enabled: !!activeConnection && !!selectedItem && (selectedItem.type === 'table' || selectedItem.type === 'view'),
  })

  const { data: indexes, isLoading: isLoadingIndexes } = useQuery({
    queryKey: ['indexes', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => apiFetch<any[]>(`/connections/${activeConnection?.id}/schema/tables/${selectedItem?.name}/indexes?schema=${currentSchema}`),
    enabled: !!activeConnection && !!selectedItem && selectedItem.type === 'table',
  })

  const { data: foreignKeys, isLoading: isLoadingForeignKeys } = useQuery({
    queryKey: ['foreign-keys', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => apiFetch<any[]>(`/connections/${activeConnection?.id}/schema/tables/${selectedItem?.name}/foreign-keys?schema=${currentSchema}`),
    enabled: !!activeConnection && !!selectedItem && selectedItem.type === 'table',
  })

  const { data: constraints, isLoading: isLoadingConstraints } = useQuery({
    queryKey: ['constraints', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => apiFetch<any[]>(`/connections/${activeConnection?.id}/schema/tables/${selectedItem?.name}/constraints?schema=${currentSchema}`),
    enabled: !!activeConnection && !!selectedItem && selectedItem.type === 'table',
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

  const editColumnMutation = useMutation({
    mutationFn: (sql: string) => apiFetch(`/connections/${activeConnection?.id}/schema/tables/${selectedItem?.name}/columns?schema=${currentSchema}`, {
      method: 'POST',
      body: JSON.stringify({ sql })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns', activeConnection?.id, selectedItem, currentSchema] })
      handleRefetch()
    }
  })

  const dropColumnMutation = useMutation({
    mutationFn: (columnName: string) => apiFetch(`/connections/${activeConnection?.id}/schema/tables/${selectedItem?.name}/columns/${columnName}?schema=${currentSchema}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns', activeConnection?.id, selectedItem, currentSchema] })
    }
  })

  const dropIndexMutation = useMutation({
    mutationFn: (indexName: string) => apiFetch(`/connections/${activeConnection?.id}/schema/tables/${selectedItem?.name}/indexes/${indexName}?schema=${currentSchema}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indexes', activeConnection?.id, selectedItem, currentSchema] })
    }
  })

  const dropForeignKeyMutation = useMutation({
    mutationFn: (constraintName: string) => apiFetch(`/connections/${activeConnection?.id}/schema/tables/${selectedItem?.name}/foreign-keys/${constraintName}?schema=${currentSchema}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foreign-keys', activeConnection?.id, selectedItem, currentSchema] })
    }
  })

  const dropConstraintMutation = useMutation({
    mutationFn: (constraintName: string) => apiFetch(`/connections/${activeConnection?.id}/schema/tables/${selectedItem?.name}/constraints/${constraintName}?schema=${currentSchema}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['constraints', activeConnection?.id, selectedItem, currentSchema] })
    }
  })

  const handleExecute = useCallback((useParams: boolean = false) => {
    if (selectedItem && activeConnection && socketRef.current) {
      if (!useParams && parameters && parameters.length > 0) {
        setShowParamModal(true)
        return
      }

      let sql = ''
      const params: DbValue[] = []

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

  const isLoadingSidebar = isLoadingTables || isLoadingViews || isLoadingProcedures || isLoadingTriggers

  const getFilteredItems = () => {
    const items = sidebarTab === 'tables' ? tables : 
                 sidebarTab === 'views' ? views : 
                 sidebarTab === 'procedures' ? procedures : triggers;
    return items?.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
  }

  const filteredItems = getFilteredItems()

  return {
    activeConnection,
    search,
    setSearch,
    selectedItem,
    setSelectedItem,
    sidebarTab,
    setSidebarTab,
    activeTab,
    setActiveTab,
    currentSchema,
    page,
    setPage,
    pageSize,
    setPageSize,
    executionStatus,
    executionError,
    socketResults,
    setSocketResults,
    setExecutionStatus,
    setExecutionError,
    editableDdl,
    setEditableDdl,
    paramValues,
    setParamsValues,
    showParamModal,
    setShowParamModal,
    isLoadingSidebar,
    filteredItems,
    columns,
    isLoadingColumns,
    indexes,
    isLoadingIndexes,
    foreignKeys,
    isLoadingForeignKeys,
    constraints,
    isLoadingConstraints,
    isLoadingDDL,
    parameters,
    updateDdlMutation,
    editColumnMutation,
    dropColumnMutation,
    dropIndexMutation,
    dropForeignKeyMutation,
    dropConstraintMutation,
    handleExecute,
    handleCancel,
    handleRefetch
  }
}
