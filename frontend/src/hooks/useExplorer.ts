import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { io, Socket } from 'socket.io-client'
import { format } from 'sql-formatter'
import { schemaService } from '@/services/schema.service'
import { useAppStore } from '@/store/useAppStore'
import type { DatabaseObject, QueryResult, DbValue, DbRow } from '@/types/database'

export interface TableInfo {
  name: string
  schema?: string
  type: string
}

export interface ColumnInfo {
  name: string;
  type: string;
  isNullable: boolean;
  isPrimaryKey?: boolean;
}

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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  // Reset selection when connection or schema changes
  useEffect(() => {
    setSelectedItem(null)
    setIsSidebarCollapsed(false)
  }, [activeConnection?.id, currentSchema])

  const handleSelectItem = useCallback((item: DatabaseObject) => {
    setSelectedItem(item)
    setIsSidebarCollapsed(true)
  }, [])

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['tables', activeConnection?.id] })
    queryClient.invalidateQueries({ queryKey: ['views', activeConnection?.id] })
    queryClient.invalidateQueries({ queryKey: ['procedures', activeConnection?.id] })
    queryClient.invalidateQueries({ queryKey: ['triggers', activeConnection?.id] })
  }, [currentSchema, activeConnection?.id, queryClient])

  // Reset page when pageSize changes
  useEffect(() => {
    setPage(0)
  }, [pageSize])

  useEffect(() => {
    const socket = io(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/queries`)
    socketRef.current = socket

    socket.on('query-progress', () => {
      setExecutionStatus('executing')
    })

    socket.on('query-result', (data: { tabId: string, columns: string[], rows: DbRow[], executionTime: number, page?: number, pageSize?: number, hasMore?: boolean }) => {
      if (data.tabId === 'explorer') {
        setSocketResults({
          columns: data.columns,
          rows: data.rows,
          executionTime: data.executionTime,
          page: data.page,
          pageSize: data.pageSize,
          hasMore: data.hasMore
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
    queryFn: () => schemaService.getTables(activeConnection!.id, currentSchema),
    enabled: !!activeConnection,
  })

  const { data: views, isLoading: isLoadingViews, refetch: refetchViews } = useQuery({
    queryKey: ['views', activeConnection?.id, currentSchema],
    queryFn: () => schemaService.getViews(activeConnection!.id, currentSchema),
    enabled: !!activeConnection,
  })

  const { data: procedures, isLoading: isLoadingProcedures, refetch: refetchProcedures } = useQuery({
    queryKey: ['procedures', activeConnection?.id, currentSchema],
    queryFn: () => schemaService.getProcedures(activeConnection!.id, currentSchema),
    enabled: !!activeConnection,
  })

  const { data: triggers, isLoading: isLoadingTriggers, refetch: refetchTriggers } = useQuery({
    queryKey: ['triggers', activeConnection?.id, currentSchema],
    queryFn: () => schemaService.getTriggers(activeConnection!.id, currentSchema),
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
    queryFn: () => schemaService.getColumns(activeConnection!.id, selectedItem!.name, currentSchema),
    enabled: !!activeConnection && !!selectedItem && (selectedItem.type === 'table' || selectedItem.type === 'view'),
  })

  const { data: indexes, isLoading: isLoadingIndexes } = useQuery({
    queryKey: ['indexes', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => schemaService.getIndexes(activeConnection!.id, selectedItem!.name, currentSchema),
    enabled: !!activeConnection && !!selectedItem && selectedItem.type === 'table',
  })

  const { data: foreignKeys, isLoading: isLoadingForeignKeys } = useQuery({
    queryKey: ['foreign-keys', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => schemaService.getForeignKeys(activeConnection!.id, selectedItem!.name, currentSchema),
    enabled: !!activeConnection && !!selectedItem && selectedItem.type === 'table',
  })

  const { data: constraints, isLoading: isLoadingConstraints } = useQuery({
    queryKey: ['constraints', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => schemaService.getConstraints(activeConnection!.id, selectedItem!.name, currentSchema),
    enabled: !!activeConnection && !!selectedItem && selectedItem.type === 'table',
  })

  const { data: ddlData, isLoading: isLoadingDDL } = useQuery({
    queryKey: ['ddl', activeConnection?.id, selectedItem, currentSchema],
    queryFn: async () => {
      const ddl = await schemaService.getDDL(activeConnection!.id, selectedItem!.name, selectedItem!.type, currentSchema)
      let formatted = ddl
      try {
        formatted = format(ddl, { language: 'mysql' })
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
    queryFn: () => schemaService.getParameters(activeConnection!.id, selectedItem!.name, selectedItem!.type, currentSchema),
    enabled: !!activeConnection && !!selectedItem && (selectedItem.type === 'procedure' || selectedItem.type === 'view'),
  })

  const updateDdlMutation = useMutation({
    mutationFn: (sql: string) => schemaService.updateDDL(activeConnection!.id, selectedItem!.name, selectedItem!.type, sql, currentSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ddl', activeConnection?.id, selectedItem] })
      handleRefetch()
    }
  })

  const editColumnMutation = useMutation({
    mutationFn: (sql: string) => schemaService.editColumn(activeConnection!.id, selectedItem!.name, sql, currentSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns', activeConnection?.id, selectedItem, currentSchema] })
      handleRefetch()
    }
  })

  const dropColumnMutation = useMutation({
    mutationFn: (columnName: string) => schemaService.dropColumn(activeConnection!.id, selectedItem!.name, columnName, currentSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns', activeConnection?.id, selectedItem, currentSchema] })
    }
  })

  const dropIndexMutation = useMutation({
    mutationFn: (indexName: string) => schemaService.dropIndex(activeConnection!.id, selectedItem!.name, indexName, currentSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indexes', activeConnection?.id, selectedItem, currentSchema] })
    }
  })

  const renameIndexMutation = useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) => 
      schemaService.renameIndex(activeConnection!.id, selectedItem!.name, oldName, newName, currentSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indexes', activeConnection?.id, selectedItem, currentSchema] })
    }
  })

  const dropForeignKeyMutation = useMutation({
    mutationFn: (constraintName: string) => schemaService.dropForeignKey(activeConnection!.id, selectedItem!.name, constraintName, currentSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foreign-keys', activeConnection?.id, selectedItem, currentSchema] })
    }
  })

  const dropConstraintMutation = useMutation({
    mutationFn: (constraintName: string) => schemaService.dropConstraint(activeConnection!.id, selectedItem!.name, constraintName, currentSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['constraints', activeConnection?.id, selectedItem, currentSchema] })
    }
  })

  const updateCell = useCallback((row: DbRow, column: string, newValue: DbValue) => {
    if (!selectedItem || !activeConnection || !socketRef.current) return

    // Try to find a primary key for a safe UPDATE
    // If no PK, we'll use all columns in WHERE (risky but common in simple DB tools)
    const pk = columns?.find(c => c.isPrimaryKey)?.name
    let sql = ''
    const params: DbValue[] = []

    if (pk) {
      sql = `UPDATE \`${selectedItem.name}\` SET \`${column}\` = ? WHERE \`${pk}\` = ?;`
      params.push(newValue, row[pk])
    } else {
      const whereClauses = Object.keys(row)
        .filter(k => row[k] !== undefined)
        .map(k => `\`${k}\` ${row[k] === null ? 'IS NULL' : '= ?'}`)
        .join(' AND ')
      
      sql = `UPDATE \`${selectedItem.name}\` SET \`${column}\` = ? WHERE ${whereClauses};`
      params.push(newValue)
      Object.keys(row).forEach(k => {
        if (row[k] !== null && row[k] !== undefined) params.push(row[k])
      })
    }

    socketRef.current.emit('execute-query', {
      connectionId: activeConnection.id,
      dto: { sql, params, schema: currentSchema },
      tabId: 'explorer',
      isSilent: true // We don't want to clear the whole table view for a single update
    })

    // Optimistic update
    setSocketResults(prev => {
      if (!prev) return prev
      return {
        ...prev,
        rows: prev.rows.map(r => r === row ? { ...r, [column]: newValue } : r)
      }
    })
  }, [selectedItem, activeConnection, columns, currentSchema])

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

  const filteredItems = useMemo(() => {
    const items =
      sidebarTab === 'tables'
        ? tables
        : sidebarTab === 'views'
          ? views
          : sidebarTab === 'procedures'
            ? procedures
            : triggers;

    if (!items) return [];

    return items.filter((t) =>
      (t.name || '').toLowerCase().includes(search.toLowerCase()),
    );
  }, [sidebarTab, tables, views, procedures, triggers, search]);

  return {
    activeConnection,
    search,
    setSearch,
    selectedItem,
    setSelectedItem: handleSelectItem,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
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
    renameIndexMutation,
    dropForeignKeyMutation,
    dropConstraintMutation,
    updateCell,
    handleExecute,
    handleCancel,
    handleRefetch
  }
}
