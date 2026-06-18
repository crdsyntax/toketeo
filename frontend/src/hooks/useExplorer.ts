import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'sql-formatter'
import { schemaService } from '@/services/schema.service'
import { useAppStore } from '@/store/useAppStore'
import { tauriApi } from '@/lib/api'
import type { DatabaseObject, QueryResult, DbValue, DbRow } from '@/types/database'
import { ExecutionStatus, SidebarTab, ExplorerTab, DatabaseObjectType } from '@/types/database'

export function useExplorer() {
  const { 
    activeConnection, 
    explorer, 
    explorerTabs,
    setExplorerState, 
    addExplorerTab, 
    updateExplorerTab,
    removeExplorerTab
  } = useAppStore()
  const queryClient = useQueryClient()

  const { search, sidebarTab, activeExplorerTabId } = explorer
  
  // Directly use the store state to ensure reactivity
  const activeTabState = activeExplorerTabId ? explorerTabs[activeExplorerTabId] : null

  const { 
    selectedItem, 
    activeTab, 
    executionStatus, 
    executionError, 
    socketResults, 
    page, 
    pageSize,
    editableDdl
  } = activeTabState || {
    selectedItem: null,
    activeTab: ExplorerTab.COLUMNS,
    executionStatus: ExecutionStatus.IDLE,
    executionError: null,
    socketResults: null,
    page: 0,
    pageSize: 50,
    editableDdl: ''
  }

  const setSearch = useCallback((s: string) => setExplorerState({ search: s }), [setExplorerState])
  const setSidebarTab = useCallback((tab: SidebarTab) => setExplorerState({ sidebarTab: tab }), [setExplorerState])
  
  const setActiveTab = useCallback((tab: ExplorerTab) => {
    if (activeExplorerTabId) {
      updateExplorerTab(activeExplorerTabId, { activeTab: tab })
    }
  }, [activeExplorerTabId, updateExplorerTab])

  const setExecutionStatus = useCallback((status: ExecutionStatus) => {
    if (activeExplorerTabId) {
      updateExplorerTab(activeExplorerTabId, { executionStatus: status })
    }
  }, [activeExplorerTabId, updateExplorerTab])

  const setExecutionError = useCallback((error: string | null) => {
    if (activeExplorerTabId) {
      updateExplorerTab(activeExplorerTabId, { executionError: error })
    }
  }, [activeExplorerTabId, updateExplorerTab])

  const setSocketResults = useCallback((results: QueryResult | null | ((prev: QueryResult | null) => QueryResult | null)) => {
    if (activeExplorerTabId) {
      const newResults = typeof results === 'function' ? results(socketResults) : results
      updateExplorerTab(activeExplorerTabId, { socketResults: newResults })
    }
  }, [activeExplorerTabId, socketResults, updateExplorerTab])

  const setEditableDdl = useCallback((ddl: string) => {
    if (activeExplorerTabId) {
      updateExplorerTab(activeExplorerTabId, { editableDdl: ddl })
    }
  }, [activeExplorerTabId, updateExplorerTab])

  const currentSchema = activeConnection?.database

  const handleSetPageSize = useCallback((size: number) => {
    if (activeExplorerTabId) {
      updateExplorerTab(activeExplorerTabId, { 
        pageSize: size,
        page: 0,
        socketResults: null, 
        executionStatus: ExecutionStatus.IDLE 
      })
    }
  }, [activeExplorerTabId, updateExplorerTab])

  const handleSetPage = useCallback((updater: number | ((p: number) => number)) => {
    if (activeExplorerTabId) {
      const newPage = typeof updater === 'function' ? updater(page) : updater
      updateExplorerTab(activeExplorerTabId, { 
        page: newPage,
        socketResults: null, 
        executionStatus: ExecutionStatus.IDLE 
      })
    }
  }, [activeExplorerTabId, page, updateExplorerTab])
  
  const [paramValues, setParamsValues] = useState<Record<string, string>>({})
  const [showParamModal, setShowParamModal] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [transactionStatus, setTransactionStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [transactionMessage, setTransactionMessage] = useState<string>('')

  const setTransactionFeedback = useCallback((status: 'idle' | 'pending' | 'success' | 'error', message: string) => {
    setTransactionStatus(status)
    setTransactionMessage(message)
    if (status === 'success' || status === 'error') {
      window.setTimeout(() => {
        setTransactionStatus('idle')
        setTransactionMessage('')
      }, 4000)
    }
  }, [])

  // Track previous connection to detect real changes
  const prevConnIdRef = useRef<string | null>(null)

  // Clear tabs when connection ID changes
  useEffect(() => {
    if (activeConnection?.id && activeConnection.id !== prevConnIdRef.current) {
      // setExplorerState({
      //   activeExplorerTabId: null
      // })
      setIsSidebarCollapsed(false)
      prevConnIdRef.current = activeConnection.id
    }
  }, [activeConnection?.id, setExplorerState])

  const handleSelectItem = useCallback((item: DatabaseObject) => {
    if (!activeConnection) return

    const tabId = `${activeConnection.id}:${currentSchema || 'default'}:${item.name}`
    
    if (explorerTabs[tabId]) {
      setExplorerState({ activeExplorerTabId: tabId })
    } else {
      addExplorerTab({
        id: tabId,
        selectedItem: item,
        activeTab: ExplorerTab.COLUMNS,
        executionStatus: ExecutionStatus.IDLE,
        executionError: null,
        socketResults: null,
        page: 0,
        pageSize: 50,
        editableDdl: ''
      })
    }
    
    setIsSidebarCollapsed(true)
  }, [activeConnection, currentSchema, explorerTabs, addExplorerTab, setExplorerState])

  const { data: tables, isLoading: isLoadingTables, refetch: refetchTables } = useQuery({
    queryKey: ['tables', activeConnection?.id, currentSchema],
    queryFn: () => schemaService.getTables(activeConnection!.id, currentSchema),
    enabled: !!activeConnection,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  })

  const { data: views, isLoading: isLoadingViews, refetch: refetchViews } = useQuery({
    queryKey: ['views', activeConnection?.id, currentSchema],
    queryFn: () => schemaService.getViews(activeConnection!.id, currentSchema),
    enabled: !!activeConnection,
    staleTime: 5 * 60 * 1000,
  })

  const { data: procedures, isLoading: isLoadingProcedures, refetch: refetchProcedures } = useQuery({
    queryKey: ['procedures', activeConnection?.id, currentSchema],
    queryFn: () => schemaService.getProcedures(activeConnection!.id, currentSchema),
    enabled: !!activeConnection,
    staleTime: 5 * 60 * 1000,
  })

  const { data: triggers, isLoading: isLoadingTriggers, refetch: refetchTriggers } = useQuery({
    queryKey: ['triggers', activeConnection?.id, currentSchema],
    queryFn: () => schemaService.getTriggers(activeConnection!.id, currentSchema),
    enabled: !!activeConnection,
    staleTime: 5 * 60 * 1000,
  })

  const { data: functions, isLoading: isLoadingFunctions, refetch: refetchFunctions } = useQuery({
    queryKey: ['functions', activeConnection?.id, currentSchema],
    queryFn: () => schemaService.getFunctions(activeConnection!.id, currentSchema),
    enabled: !!activeConnection,
    staleTime: 5 * 60 * 1000,
  })

  const handleRefetch = useCallback(() => {
    if (sidebarTab === SidebarTab.TABLES) refetchTables()
    else if (sidebarTab === SidebarTab.VIEWS) refetchViews()
    else if (sidebarTab === SidebarTab.PROCEDURES) refetchProcedures()
    else if (sidebarTab === SidebarTab.TRIGGERS) refetchTriggers()
    else if (sidebarTab === SidebarTab.FUNCTIONS) refetchFunctions()

    if (selectedItem && activeTab === ExplorerTab.DATA) {
      setExecutionStatus(ExecutionStatus.IDLE)
    }
  }, [sidebarTab, refetchTables, refetchViews, refetchProcedures, refetchTriggers, refetchFunctions, selectedItem, activeTab, setExecutionStatus])

  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    queryKey: ['columns', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => schemaService.getColumns(activeConnection!.id, selectedItem!.name, currentSchema),
    enabled: !!activeConnection && !!selectedItem && (selectedItem.type === DatabaseObjectType.TABLE || selectedItem.type === DatabaseObjectType.VIEW),
  })

  const { data: indexes, isLoading: isLoadingIndexes } = useQuery({
    queryKey: ['indexes', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => schemaService.getIndexes(activeConnection!.id, selectedItem!.name, currentSchema),
    enabled: !!activeConnection && !!selectedItem && selectedItem.type === DatabaseObjectType.TABLE,
  })

  const { data: foreignKeys, isLoading: isLoadingForeignKeys } = useQuery({
    queryKey: ['foreign-keys', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => schemaService.getForeignKeys(activeConnection!.id, selectedItem!.name, currentSchema),
    enabled: !!activeConnection && !!selectedItem && selectedItem.type === DatabaseObjectType.TABLE,
  })

  const { data: constraints, isLoading: isLoadingConstraints } = useQuery({
    queryKey: ['constraints', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => schemaService.getConstraints(activeConnection!.id, selectedItem!.name, currentSchema),
    enabled: !!activeConnection && !!selectedItem && selectedItem.type === DatabaseObjectType.TABLE,
  })

  const { data: ddlData, isLoading: isLoadingDDL, error: errorDDL } = useQuery({
    queryKey: ['ddl', activeConnection?.id, selectedItem, currentSchema],
    queryFn: async () => {
      const ddl = await schemaService.getDDL(activeConnection!.id, selectedItem!.name, selectedItem!.type, currentSchema)
      let formatted = ddl
      try {
        let lang = 'mysql';
        switch(activeConnection?.type) {
          case 'postgres': lang = 'postgresql'; break;
          case 'sqlserver': lang = 'tsql'; break;
          default: lang = 'mysql'; break;
        }
        formatted = format(ddl, { language: lang as 'mysql' | 'postgresql' | 'tsql' })
      } catch (e) {
        console.error('SQL Formatting error:', e);
        // ignore format error
      }
      return { ddl: formatted }
    },
    enabled: !!activeConnection && !!selectedItem && (
      activeTab === ExplorerTab.DDL || 
      selectedItem.type === DatabaseObjectType.PROCEDURE || 
      selectedItem.type === DatabaseObjectType.FUNCTION
    ),
  })

  // Sync editableDdl with query result
  const lastSyncedDdl = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (ddlData?.ddl !== undefined && ddlData.ddl !== lastSyncedDdl.current) {
      lastSyncedDdl.current = ddlData.ddl
      setEditableDdl(ddlData.ddl)
    }
  }, [ddlData?.ddl, setEditableDdl])

  const { data: parameters } = useQuery({
    queryKey: ['parameters', activeConnection?.id, selectedItem, currentSchema],
    queryFn: () => schemaService.getParameters(activeConnection!.id, selectedItem!.name, selectedItem!.type, currentSchema),
    enabled: !!activeConnection && !!selectedItem && (selectedItem.type === DatabaseObjectType.PROCEDURE || selectedItem.type === DatabaseObjectType.VIEW),
  })

  const updateDdlMutation = useMutation({
    mutationFn: (sql: string) => schemaService.updateDDL(activeConnection!.id, selectedItem!.name, selectedItem!.type, sql, currentSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ddl', activeConnection?.id, selectedItem] })
      handleRefetch()
    }
  })

  const commitTransaction = useCallback(async () => {
    if (!activeConnection) return
    setTransactionFeedback('pending', 'Committing transaction...')
    try {
      await schemaService.commitTransaction(activeConnection.id)
      queryClient.invalidateQueries({ queryKey: ['ddl', activeConnection.id, selectedItem] })
      queryClient.invalidateQueries({ queryKey: ['procedures', activeConnection.id, currentSchema] })
      handleRefetch()
      setTransactionFeedback('success', 'Transaction committed successfully.')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to commit transaction'
      setTransactionFeedback('error', message)
    }
  }, [activeConnection, currentSchema, handleRefetch, queryClient, selectedItem, setTransactionFeedback])

  const rollbackTransaction = useCallback(async () => {
    if (!activeConnection) return
    setTransactionFeedback('pending', 'Rolling back transaction...')
    try {
      await schemaService.rollbackTransaction(activeConnection.id)
      queryClient.invalidateQueries({ queryKey: ['ddl', activeConnection.id, selectedItem] })
      queryClient.invalidateQueries({ queryKey: ['procedures', activeConnection.id, currentSchema] })
      handleRefetch()
      setTransactionFeedback('success', 'Transaction rolled back successfully.')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to rollback transaction'
      setTransactionFeedback('error', message)
    }
  }, [activeConnection, currentSchema, handleRefetch, queryClient, selectedItem, setTransactionFeedback])

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
    if (!selectedItem || !activeConnection) return

    // Qualify table name with schema if available
    const tableName = currentSchema 
      ? `\`${currentSchema.replace(/`/g, "``")}\`.\`${selectedItem.name.replace(/`/g, "``")}\``
      : `\`${selectedItem.name.replace(/`/g, "``")}\``;

    // Try to find a primary key for a safe UPDATE
    const pk = columns?.find(c => c.isPrimaryKey)?.name
    let sqlTemplate: string
    const params: DbValue[] = []

    if (pk) {
      sqlTemplate = `UPDATE ${tableName} SET \`${column.replace(/`/g, "``")}\` = ? WHERE \`${pk.replace(/`/g, "``")}\` = ?;`
      params.push(newValue, row[pk])
    } else {
      const whereClauses = Object.keys(row)
        .filter(k => row[k] !== undefined)
        .map(k => `\`${k.replace(/`/g, "``")}\` ${row[k] === null ? 'IS NULL' : '= ?'}`)
        .join(' AND ')
      
      sqlTemplate = `UPDATE ${tableName} SET \`${column.replace(/`/g, "``")}\` = ? WHERE ${whereClauses};`
      params.push(newValue)
      Object.keys(row).forEach(k => {
        if (row[k] !== null && row[k] !== undefined) params.push(row[k])
      })
    }

    const finalSql = sqlTemplate.replace(/\?/g, () => {
      const val = params.shift();
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
      return String(val);
    });

    tauriApi.invoke('execute_query', {
      id: activeConnection.id,
      query: finalSql
    }).catch(err => {
      console.error('Failed to update cell:', err);
    });

    // Optimistic update
    setSocketResults((prev: QueryResult | null) => {
      if (!prev) return prev
      return {
        ...prev,
        rows: (prev.rows as DbRow[]).map((r: DbRow) => r === row ? { ...r, [column]: newValue } : r)
      } as QueryResult
    })
  }, [selectedItem, activeConnection, columns, currentSchema, setSocketResults])

  const handleExecute = useCallback(async (useParams: boolean = false) => {
    if (selectedItem && activeConnection) {
      if (!useParams && parameters && parameters.length > 0) {
        setShowParamModal(true)
        return
      }

      setExplorerState({
        executionStatus: ExecutionStatus.EXECUTING,
        executionError: null,
        socketResults: null
      })
      setShowParamModal(false)

      try {
        const result = await schemaService.executeExplorer({
          connectionId: activeConnection.id,
          database: currentSchema,
          name: selectedItem.name,
          objectType: selectedItem.type,
          page: page + 1,
          pageSize: pageSize,
          params: useParams ? paramValues : undefined
        })
        
        if (activeExplorerTabId) {
          updateExplorerTab(activeExplorerTabId, {
            socketResults: result,
            executionStatus: ExecutionStatus.SUCCESS,
            executionError: null
          });
        }

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to execute query'
        setExplorerState({
          executionStatus: ExecutionStatus.ERROR,
          executionError: errorMessage,
          socketResults: null
        })
      }
    }
  }, [selectedItem, activeConnection, pageSize, page, parameters, paramValues, currentSchema, setExplorerState])

  // Automatic execution trigger: fires when the active item or pagination parameters change
  useEffect(() => {
    const isDataTable = selectedItem?.type === DatabaseObjectType.TABLE || selectedItem?.type === DatabaseObjectType.VIEW;
    const isDataTab = activeTab === ExplorerTab.DATA;
    // Check if we need data (executionStatus is IDLE or we just don't have results)
    const needsExecution = isDataTable && isDataTab && (executionStatus === ExecutionStatus.IDLE || socketResults === null);

    if (needsExecution) {
      handleExecute();
    }
  }, [activeTab, executionStatus, handleExecute, selectedItem?.type, socketResults])

  const handleCancel = useCallback(() => {
    setExecutionStatus(ExecutionStatus.ERROR)
    setExecutionError('Query cancelled by user')
  }, [setExecutionStatus, setExecutionError])

  const isLoadingSidebar = isLoadingTables || isLoadingViews || isLoadingProcedures || isLoadingTriggers || isLoadingFunctions

  const filteredItems = useMemo(() => {
    let items: { name: string }[] | undefined;
    switch (sidebarTab) {
      case SidebarTab.TABLES: items = tables; break;
      case SidebarTab.VIEWS: items = views; break;
      case SidebarTab.PROCEDURES: items = procedures; break;
      case SidebarTab.TRIGGERS: items = triggers; break;
      case SidebarTab.FUNCTIONS: items = functions; break;
    }

    if (!items) return [];

    return items.filter((t) =>
      (t.name || '').toLowerCase().includes(search.toLowerCase()),
    );
  }, [sidebarTab, tables, views, procedures, triggers, functions, search]);

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
    setPage: handleSetPage,
    pageSize,
    setPageSize: handleSetPageSize,
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
    errorDDL,
    parameters,
    transactionStatus,
    transactionMessage,
    commitTransaction,
    rollbackTransaction,
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
    handleRefetch,
    explorerTabs,
    activeExplorerTabId,
    removeExplorerTab,
    setExplorerState
  }
}
