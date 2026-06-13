import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'sql-formatter'
import { schemaService } from '@/services/schema.service'
import { useAppStore } from '@/store/useAppStore'
import { tauriApi } from '@/lib/api'
import type { DatabaseObject, QueryResult, DbValue, DbRow } from '@/types/database'
import { ExecutionStatus, SidebarTab, ExplorerTab, DatabaseObjectType } from '@/types/database'

export function useExplorer() {
  const { activeConnection, explorer, setExplorerState } = useAppStore()
  const queryClient = useQueryClient()

  const { search, selectedItem, sidebarTab, activeTab, executionStatus, executionError, socketResults } = explorer
  const setSearch = useCallback((s: string) => setExplorerState({ search: s }), [setExplorerState])
  const setSelectedItem = useCallback((item: DatabaseObject | null) => setExplorerState({ selectedItem: item }), [setExplorerState])
  const setSidebarTab = useCallback((tab: SidebarTab) => setExplorerState({ sidebarTab: tab }), [setExplorerState])
  const setActiveTab = useCallback((tab: ExplorerTab) => setExplorerState({ activeTab: tab }), [setExplorerState])
  const setExecutionStatus = useCallback((status: ExecutionStatus) => setExplorerState({ executionStatus: status }), [setExplorerState])
  const setExecutionError = useCallback((error: string | null) => setExplorerState({ executionError: error }), [setExplorerState])
  const setSocketResults = useCallback((results: QueryResult | null) => setExplorerState({ socketResults: results }), [setExplorerState])

  const currentSchema = activeConnection?.database || ''

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)

  const handleSetPageSize = useCallback((size: number) => {
    setPageSize(size)
    setPage(0)
  }, [])
  
  const [editableDdl, setEditableDdl] = useState('')
  const [paramValues, setParamsValues] = useState<Record<string, string>>({})
  const [showParamModal, setShowParamModal] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  // Track previous connection to detect real changes
  const prevConnIdRef = useRef<string | null>(null)

  // Reset selection ONLY when connection ID changes
  useEffect(() => {
    if (activeConnection?.id && activeConnection.id !== prevConnIdRef.current) {
      setSelectedItem(null)
      setIsSidebarCollapsed(false)
      prevConnIdRef.current = activeConnection.id
    }
  }, [activeConnection?.id, setSelectedItem])

  const handleSelectItem = useCallback((item: DatabaseObject) => {
    setSelectedItem(item)
    setIsSidebarCollapsed(true)
  }, [setSelectedItem])

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
  }, [sidebarTab, refetchTables, refetchViews, refetchProcedures, refetchTriggers, refetchFunctions])

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

  const { isLoading: isLoadingDDL } = useQuery({
    queryKey: ['ddl', activeConnection?.id, selectedItem, currentSchema],
    queryFn: async () => {
      const ddl = await schemaService.getDDL(activeConnection!.id, selectedItem!.name, selectedItem!.type, currentSchema)
      let formatted = ddl
      try {
        formatted = format(ddl, { language: 'mysql' })
      } catch {
        // ignore format error
      }
      setEditableDdl(formatted)
      return { ddl: formatted }
    },
    enabled: !!activeConnection && !!selectedItem && activeTab === ExplorerTab.DDL,
  })

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
    setSocketResults(prev => {
      if (!prev) return prev
      return {
        ...prev,
        rows: prev.rows.map(r => r === row ? { ...r, [column]: newValue } : r)
      }
    })
  }, [selectedItem, activeConnection, columns, currentSchema, setSocketResults])

  const handleExecute = useCallback(async (useParams: boolean = false) => {
    if (selectedItem && activeConnection) {
      if (!useParams && parameters && parameters.length > 0) {
        setShowParamModal(true)
        return
      }

      setExecutionStatus(ExecutionStatus.EXECUTING)
      setExecutionError(null)
      setSocketResults(null)
      setShowParamModal(false)

      try {
        const result = await schemaService.executeExplorer({
          connectionId: activeConnection.id,
          database: currentSchema,
          name: selectedItem.name,
          objectType: selectedItem.type,
          page: page + 1, // Rust side might expect 1-based paging
          pageSize: pageSize,
          params: useParams ? paramValues : undefined
        })
        
        setSocketResults(result)
        setExecutionStatus(ExecutionStatus.SUCCESS)
      } catch (err: unknown) {
        setExecutionStatus(ExecutionStatus.ERROR)
        const errorMessage = err instanceof Error ? err.message : 'Failed to execute query'
        setExecutionError(errorMessage)
      }
    }
  }, [selectedItem, activeConnection, pageSize, page, parameters, paramValues, currentSchema, setExecutionStatus, setExecutionError, setSocketResults])

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
    setPage,
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
