import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'sql-formatter';
import { schemaService } from '@/services/schema.service';
import { connectionService } from '@/services/connection.service';
import { useAppStore } from '@/store/useAppStore';
import { tauriApi } from '@/lib/api';
import { normalizeFilterQuotes } from '@/lib/sqlGenerator';
import { toast } from 'react-hot-toast';
import type {
  DatabaseObject,
  QueryResult,
  DbValue,
  CellValue,
  DbRow,
} from '@/types/database';
import {
  DatabaseType,
  ExecutionStatus,
  Environment,
  SidebarTab,
  ExplorerTab,
  DatabaseObjectType,
} from '@/types/database';

export function useExplorer() {
  const {
    activeConnection,
    lastExplorerContext,
    explorer,
    explorerTabs,
    setExplorerState,
    setActiveConnection,
    addExplorerTab,
    updateExplorerTab,
    removeExplorerTab,
  } = useAppStore();
  const queryClient = useQueryClient();

  const { data: connections = [], isLoading: connectionsLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  });

  const connectedConnectionIds = useAppStore((s) => s.connectedConnectionIds);

  const { search, sidebarTab, activeExplorerTabId } = explorer;

  const activeTabState = activeExplorerTabId
    ? explorerTabs[activeExplorerTabId]
    : null;

  // Each explorer tab carries its own connection context (connectionId +
  // database). All operations below resolve against the ACTIVE tab's
  // connection, falling back to the global activeConnection when no tabs are
  // open, when the tab has no connection (legacy) or when it can't be found.
  // Resolving against activeConnection (instead of null) when all tabs are
  // closed keeps the sidebar showing the last connection's objects instead of
  // requiring a manual refresh.
  // activeConnection is intentionally NOT persisted, so after a reload it is
  // null. The persisted lastExplorerContext (set whenever a tab is opened or
  // closed) provides the fallback in that case, so the sidebar still shows the
  // last connection's objects.
  // Once the connections list has loaded, a fallback connection that is no
  // longer in the list (deleted/ghost) is treated as null so the explorer
  // never surfaces a connection that no longer exists. While the list is
  // still loading, the fallback is trusted to avoid a flicker.
  const resolvedConnection = useMemo(() => {
    const hasExplorerTabs = Object.keys(explorerTabs).length > 0;
    const tabConnId = hasExplorerTabs ? activeTabState?.connectionId : undefined;
    const tabMatch = tabConnId ? connections.find((c) => c.id === tabConnId) : undefined;
    if (tabMatch) return tabMatch;
    const fallback =
      activeConnection ??
      (lastExplorerContext
        ? connections.find((c) => c.id === lastExplorerContext.connectionId) ?? null
        : null);
    if (!fallback) return null;
    const fallbackIsGhost =
      !connectionsLoading &&
      !connections.some((c) => c.id === fallback.id);
    return fallbackIsGhost ? null : fallback;
  }, [explorerTabs, activeTabState?.connectionId, connections, connectionsLoading, activeConnection, lastExplorerContext]);

  const {
    selectedItem,
    activeTab,
    executionStatus,
    executionError,
    socketResults,
    page,
    pageSize,
    editableDdl,
    filter,
  } = activeTabState || {
    selectedItem: null,
    activeTab: ExplorerTab.COLUMNS,
    executionStatus: ExecutionStatus.IDLE,
    executionError: null,
    socketResults: null,
    page: 0,
    pageSize: 50,
    editableDdl: '',
    filter: '',
  };

  const setFilter = useCallback(
    (f: string) => {
      if (activeExplorerTabId) {
        updateExplorerTab(activeExplorerTabId, { filter: f });
      }
    },
    [activeExplorerTabId, updateExplorerTab],
  );

  const setSearch = useCallback(
    (s: string) => setExplorerState({ search: s }),
    [setExplorerState],
  );

  const switchExplorerConnection = useCallback(
    (connection: typeof activeConnection) => {
      if (!connection) return;
      // Restore the database the user was browsing on this connection: the raw
      // connection object often has no `database` (e.g. MongoDB picks it per
      // session), so carry over the lastExplorerContext when it belongs to it.
      const ctxMatches =
        lastExplorerContext?.connectionId === connection.id
          ? lastExplorerContext.database
          : undefined;
      setActiveConnection({
        ...connection,
        database: connection.database || ctxMatches || undefined,
      });
      const connTabs = Object.values(explorerTabs).filter(
        (t) => t.connectionId === connection.id,
      );
      setExplorerState({
        // Focus the connection's most recent tab so the explorer actually
        // switches. When the connection has no open tabs yet, clear the active
        // tab so the sidebar falls back to showing the new connection's objects.
        activeExplorerTabId:
          connTabs.length > 0 ? connTabs[connTabs.length - 1].id : null,
      });
    },
    [setActiveConnection, explorerTabs, setExplorerState, lastExplorerContext],
  );
  const setSidebarTab = useCallback(
    (tab: SidebarTab) => setExplorerState({ sidebarTab: tab }),
    [setExplorerState],
  );

  const setActiveTab = useCallback(
    (tab: ExplorerTab) => {
      if (activeExplorerTabId) {
        updateExplorerTab(activeExplorerTabId, { activeTab: tab });
      }
    },
    [activeExplorerTabId, updateExplorerTab],
  );

  const setExecutionStatus = useCallback(
    (status: ExecutionStatus) => {
      if (activeExplorerTabId) {
        updateExplorerTab(activeExplorerTabId, { executionStatus: status });
      }
    },
    [activeExplorerTabId, updateExplorerTab],
  );

  const setExecutionError = useCallback(
    (error: string | null) => {
      if (activeExplorerTabId) {
        updateExplorerTab(activeExplorerTabId, { executionError: error });
      }
    },
    [activeExplorerTabId, updateExplorerTab],
  );

  const setSocketResults = useCallback(
    (
      results:
        | QueryResult
        | null
        | ((prev: QueryResult | null) => QueryResult | null),
    ) => {
      if (activeExplorerTabId) {
        const newResults =
          typeof results === 'function' ? results(socketResults) : results;
        updateExplorerTab(activeExplorerTabId, { socketResults: newResults });
      }
    },
    [activeExplorerTabId, socketResults, updateExplorerTab],
  );

  const setEditableDdl = useCallback(
    (ddl: string) => {
      if (activeExplorerTabId) {
        updateExplorerTab(activeExplorerTabId, { editableDdl: ddl });
      }
    },
    [activeExplorerTabId, updateExplorerTab],
  );

  // Only fall back to the persisted lastExplorerContext when it belongs to the
  // connection we are actually resolving. Otherwise a Mongo connection (which
  // typically has no `database` field) would inherit the schema of whatever
  // connection was browsed last (e.g. Postgres 'public') and the sidebar would
  // query the wrong database after closing the last tab.
  const currentSchema =
    activeTabState?.database ||
    activeConnection?.database ||
    (resolvedConnection &&
    lastExplorerContext &&
    lastExplorerContext.connectionId === resolvedConnection.id
      ? lastExplorerContext.database
      : undefined);

  const handleSetPageSize = useCallback(
    (size: number) => {
      if (activeExplorerTabId) {
        updateExplorerTab(activeExplorerTabId, {
          pageSize: size,
          page: 0,
          socketResults: null,
          executionStatus: ExecutionStatus.IDLE,
        });
      }
    },
    [activeExplorerTabId, updateExplorerTab],
  );

  const handleSetPage = useCallback(
    (updater: number | ((p: number) => number)) => {
      if (activeExplorerTabId) {
        const currentPage = explorerTabs[activeExplorerTabId]?.page || 0;
        const newPage =
          typeof updater === 'function' ? updater(currentPage) : updater;
        updateExplorerTab(activeExplorerTabId, {
          page: newPage,
          socketResults: null,
          executionStatus: ExecutionStatus.IDLE,
        });
      }
    },
    [activeExplorerTabId, explorerTabs, updateExplorerTab],
  );

  const [paramValues, setParamsValues] = useState<Record<string, string>>({});
  const [showParamModal, setShowParamModal] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<
    'idle' | 'pending' | 'success' | 'error'
  >('idle');
  const [transactionMessage, setTransactionMessage] = useState<string>('');

  const setTransactionFeedback = useCallback(
    (status: 'idle' | 'pending' | 'success' | 'error', message: string) => {
      setTransactionStatus(status);
      setTransactionMessage(message);
      if (status === 'success' || status === 'error') {
        window.setTimeout(() => {
          setTransactionStatus('idle');
          setTransactionMessage('');
        }, 4000);
      }
    },
    [],
  );

  const prevConnIdRef = useRef<string | null>(null);
  const prevSchemaRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!resolvedConnection) return;

    const isRedis = resolvedConnection.type === DatabaseType.REDIS;
    const connChanged = resolvedConnection.id !== prevConnIdRef.current;
    const schemaChanged = currentSchema !== prevSchemaRef.current;

    if (isRedis) {
      if (connChanged || schemaChanged) {
        setIsSidebarCollapsed(true);
        prevConnIdRef.current = resolvedConnection.id;
        prevSchemaRef.current = currentSchema;
      }
    } else if (connChanged) {
      setIsSidebarCollapsed(false);
      prevConnIdRef.current = resolvedConnection.id;
      prevSchemaRef.current = currentSchema;
    }
  }, [resolvedConnection, currentSchema]);

  const handleSelectItem = useCallback(
    (item: DatabaseObject) => {
      // Tras desconectar/volver a conectar, los explorer tabs se limpian y
      // `resolvedConnection` puede ser null; se cae a `activeConnection` para
      // que el doble-click siga abriendo/recargando la tabla. Una vez creado el
      // tab, `resolvedConnection` se resuelve y dispara la carga de datos.
      const conn = resolvedConnection ?? activeConnection;
      if (!conn) return;

      const tabId = `${conn.id}:${currentSchema || 'default'}:${item.name}`;
      const nextActiveTab =
        item.type === DatabaseObjectType.TABLE ||
        item.type === DatabaseObjectType.VIEW
          ? ExplorerTab.DATA
          : ExplorerTab.DDL;

      if (explorerTabs[tabId]) {
        updateExplorerTab(tabId, {
          executionStatus: ExecutionStatus.IDLE,
          executionError: null,
          socketResults: null,
        });
        setExplorerState({ activeExplorerTabId: tabId });
      } else if (
        activeExplorerTabId &&
        explorerTabs[activeExplorerTabId] &&
        !explorerTabs[activeExplorerTabId].selectedItem?.name
      ) {
        // The active tab is an empty slot left after switching databases via
        // the connections sidebar. Reuse it (re-keyed to the new object)
        // instead of accumulating hidden tabs.
        removeExplorerTab(activeExplorerTabId);
        addExplorerTab({
          id: tabId,
          connectionId: conn.id,
          database: currentSchema || '',
          selectedItem: item,
          activeTab: nextActiveTab,
          executionStatus: ExecutionStatus.IDLE,
          executionError: null,
          socketResults: null,
          page: 0,
          pageSize: 50,
          editableDdl: '',
          filter: '',
        });
      } else {
        addExplorerTab({
          id: tabId,
          connectionId: conn.id,
          database: currentSchema || '',
          selectedItem: item,
          activeTab: nextActiveTab,
          executionStatus: ExecutionStatus.IDLE,
          executionError: null,
          socketResults: null,
          page: 0,
          pageSize: 50,
          editableDdl: '',
          filter: '',
        });
      }

      // Nota: el sidebar NO se colapsa al seleccionar (para poder hacer
      // multi-selección sin perder la vista). Se colapsa solo con doble-click
      // desde el propio Sidebar.
    },
    [
      resolvedConnection,
      activeConnection,
      currentSchema,
      explorerTabs,
      activeExplorerTabId,
      addExplorerTab,
      updateExplorerTab,
      removeExplorerTab,
      setExplorerState,
    ],
  );

  const {
    data: tables,
    isLoading: isLoadingTables,
    refetch: refetchTables,
  } = useQuery({
    queryKey: ['tables', resolvedConnection?.id, currentSchema],
    queryFn: () => schemaService.getTables(resolvedConnection!.id, currentSchema),
    enabled: !!resolvedConnection && sidebarTab === SidebarTab.TABLES,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: views,
    isLoading: isLoadingViews,
    refetch: refetchViews,
  } = useQuery({
    queryKey: ['views', resolvedConnection?.id, currentSchema],
    queryFn: () => schemaService.getViews(resolvedConnection!.id, currentSchema),
    enabled: !!resolvedConnection && sidebarTab === SidebarTab.VIEWS,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: procedures,
    isLoading: isLoadingProcedures,
    refetch: refetchProcedures,
  } = useQuery({
    queryKey: ['procedures', resolvedConnection?.id, currentSchema],
    queryFn: () =>
      schemaService.getProcedures(resolvedConnection!.id, currentSchema),
    enabled: !!resolvedConnection && sidebarTab === SidebarTab.PROCEDURES,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: triggers,
    isLoading: isLoadingTriggers,
    refetch: refetchTriggers,
  } = useQuery({
    queryKey: ['triggers', resolvedConnection?.id, currentSchema],
    queryFn: () =>
      schemaService.getTriggers(resolvedConnection!.id, currentSchema),
    enabled: !!resolvedConnection && sidebarTab === SidebarTab.TRIGGERS,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: functions,
    isLoading: isLoadingFunctions,
    refetch: refetchFunctions,
  } = useQuery({
    queryKey: ['functions', resolvedConnection?.id, currentSchema],
    queryFn: () =>
      schemaService.getFunctions(resolvedConnection!.id, currentSchema),
    enabled: !!resolvedConnection && sidebarTab === SidebarTab.FUNCTIONS,
    staleTime: 5 * 60 * 1000,
  });

  const handleRefetch = useCallback(() => {
    if (resolvedConnection) {
      schemaService.clearMetadataCache(resolvedConnection.id).catch(() => undefined)
    }
    if (sidebarTab === SidebarTab.TABLES) refetchTables();
    else if (sidebarTab === SidebarTab.VIEWS) refetchViews();
    else if (sidebarTab === SidebarTab.PROCEDURES) refetchProcedures();
    else if (sidebarTab === SidebarTab.TRIGGERS) refetchTriggers();
    else if (sidebarTab === SidebarTab.FUNCTIONS) refetchFunctions();

    if (selectedItem && activeTab === ExplorerTab.DATA) {
      setExecutionStatus(ExecutionStatus.IDLE);
    }
  }, [
    resolvedConnection,
    sidebarTab,
    refetchTables,
    refetchViews,
    refetchProcedures,
    refetchTriggers,
    refetchFunctions,
    selectedItem,
    activeTab,
    setExecutionStatus,
  ]);

  /**
   * Refresh everything the Explorer shows for the current object after a
   * schema mutation (add/edit/drop column, index, FK, DDL, …):
   * - clears the backend metadata cache,
   * - invalidates the React Query caches (columns, indexes, FKs, constraints,
   *   DDL, parameters),
   * - refetches the sidebar lists,
   * - re-runs the Data tab so the grid picks up the new schema.
   */
  const refreshExplorerData = useCallback(() => {
    if (resolvedConnection?.id) {
      schemaService.clearMetadataCache(resolvedConnection.id).catch(() => undefined)
    }
    if (selectedItem) {
      const base = [resolvedConnection?.id, selectedItem, currentSchema] as const
      queryClient.invalidateQueries({ queryKey: ['columns', ...base] })
      queryClient.invalidateQueries({ queryKey: ['indexes', ...base] })
      queryClient.invalidateQueries({ queryKey: ['foreign-keys', ...base] })
      queryClient.invalidateQueries({ queryKey: ['constraints', ...base] })
      queryClient.invalidateQueries({ queryKey: ['ddl', ...base] })
      queryClient.invalidateQueries({ queryKey: ['parameters', ...base] })
    }
    handleRefetch()
    if (selectedItem) {
      setExecutionStatus(ExecutionStatus.IDLE)
      setSocketResults(null)
    }
  }, [
    resolvedConnection,
    selectedItem,
    currentSchema,
    queryClient,
    handleRefetch,
    setExecutionStatus,
    setSocketResults,
  ]);

  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    queryKey: ['columns', resolvedConnection?.id, selectedItem, currentSchema],
    queryFn: () =>
      schemaService.getColumns(
        resolvedConnection!.id,
        selectedItem!.name,
        currentSchema,
      ),
    enabled:
      !!resolvedConnection &&
      !!selectedItem &&
      (selectedItem.type === DatabaseObjectType.TABLE ||
        selectedItem.type === DatabaseObjectType.VIEW),
    staleTime: 5 * 60 * 1000,
  });

  const { data: indexes, isLoading: isLoadingIndexes } = useQuery({
    queryKey: ['indexes', resolvedConnection?.id, selectedItem, currentSchema],
    queryFn: () =>
      schemaService.getIndexes(
        resolvedConnection!.id,
        selectedItem!.name,
        currentSchema,
      ),
    enabled:
      !!resolvedConnection &&
      !!selectedItem &&
      selectedItem.type === DatabaseObjectType.TABLE,
    staleTime: 5 * 60 * 1000,
  });

  const { data: foreignKeys, isLoading: isLoadingForeignKeys } = useQuery({
    queryKey: [
      'foreign-keys',
      resolvedConnection?.id,
      selectedItem,
      currentSchema,
    ],
    queryFn: () =>
      schemaService.getForeignKeys(
        resolvedConnection!.id,
        selectedItem!.name,
        currentSchema,
      ),
    enabled:
      !!resolvedConnection &&
      !!selectedItem &&
      selectedItem.type === DatabaseObjectType.TABLE,
    staleTime: 5 * 60 * 1000,
  });

  const { data: constraints, isLoading: isLoadingConstraints } = useQuery({
    queryKey: [
      'constraints',
      resolvedConnection?.id,
      selectedItem,
      currentSchema,
    ],
    queryFn: () =>
      schemaService.getConstraints(
        resolvedConnection!.id,
        selectedItem!.name,
        currentSchema,
      ),
    enabled:
      !!resolvedConnection &&
      !!selectedItem &&
      selectedItem.type === DatabaseObjectType.TABLE,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: ddlData,
    isLoading: isLoadingDDL,
    error: errorDDL,
  } = useQuery({
    queryKey: ['ddl', resolvedConnection?.id, selectedItem, currentSchema],
    queryFn: async () => {
      const ddl = await schemaService.getDDL(
        resolvedConnection!.id,
        selectedItem!.name,
        selectedItem!.type,
        currentSchema,
      );
      let formatted = ddl;
      try {
        let lang = 'mysql';
        switch (resolvedConnection?.type) {
          case DatabaseType.POSTGRES:
            lang = 'postgresql';
            break;
          case DatabaseType.SQLSERVER:
            lang = 'tsql';
            break;
          default:
            lang = 'mysql';
            break;
        }
        formatted = format(ddl, {
          language: lang as 'mysql' | 'postgresql' | 'tsql',
        });
      } catch (e) {
        console.error('SQL Formatting error:', e);
      }
      return { ddl: formatted };
    },
    enabled:
      !!resolvedConnection &&
      !!selectedItem &&
      (activeTab === ExplorerTab.DDL ||
        selectedItem.type === DatabaseObjectType.PROCEDURE ||
        selectedItem.type === DatabaseObjectType.FUNCTION),
    staleTime: 5 * 60 * 1000,
  });

  const lastSyncedDdl = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (ddlData?.ddl !== undefined && ddlData.ddl !== lastSyncedDdl.current) {
      lastSyncedDdl.current = ddlData.ddl;
      setEditableDdl(ddlData.ddl);
    }
  }, [ddlData?.ddl, setEditableDdl]);

  const { data: parameters } = useQuery({
    queryKey: ['parameters', resolvedConnection?.id, selectedItem, currentSchema],
    queryFn: () =>
      schemaService.getParameters(
        resolvedConnection!.id,
        selectedItem!.name,
        selectedItem!.type,
        currentSchema,
      ),
    enabled:
      !!resolvedConnection &&
      !!selectedItem &&
      (selectedItem.type === DatabaseObjectType.PROCEDURE ||
        selectedItem.type === DatabaseObjectType.VIEW),
    staleTime: 5 * 60 * 1000,
  });

  const updateDdlMutation = useMutation({
    mutationFn: (sql: string) =>
      schemaService.updateDDL(
        resolvedConnection!.id,
        selectedItem!.name,
        selectedItem!.type,
        sql,
        currentSchema,
      ),
    onSuccess: () => {
      refreshExplorerData();
    },
  });

  const commitTransaction = useCallback(async () => {
    if (!resolvedConnection) return;
    setTransactionFeedback('pending', 'Committing transaction...');
    try {
      await schemaService.commitTransaction(resolvedConnection.id);
      queryClient.invalidateQueries({
        queryKey: ['procedures', resolvedConnection.id, currentSchema],
      });
      refreshExplorerData();
      setTransactionFeedback('success', 'Transaction committed successfully.');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to commit transaction';
      setTransactionFeedback('error', message);
    }
  }, [
    resolvedConnection,
    currentSchema,
    refreshExplorerData,
    queryClient,
    setTransactionFeedback,
  ]);

  const rollbackTransaction = useCallback(async () => {
    if (!resolvedConnection) return;
    setTransactionFeedback('pending', 'Rolling back transaction...');
    try {
      await schemaService.rollbackTransaction(resolvedConnection.id);
      queryClient.invalidateQueries({
        queryKey: ['procedures', resolvedConnection.id, currentSchema],
      });
      refreshExplorerData();
      setTransactionFeedback(
        'success',
        'Transaction rolled back successfully.',
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to rollback transaction';
      setTransactionFeedback('error', message);
    }
  }, [
    resolvedConnection,
    currentSchema,
    refreshExplorerData,
    queryClient,
    setTransactionFeedback,
  ]);

  const editColumnMutation = useMutation({
    mutationFn: (sql: string) =>
      schemaService.editColumn(
        resolvedConnection!.id,
        selectedItem!.name,
        sql,
        currentSchema,
      ),
    onSuccess: () => {
      refreshExplorerData();
    },
  });

  const dropColumnMutation = useMutation({
    mutationFn: (columnName: string) =>
      schemaService.dropColumn(
        resolvedConnection!.id,
        selectedItem!.name,
        columnName,
        currentSchema,
      ),
    onSuccess: () => {
      refreshExplorerData();
    },
  });

  const dropIndexMutation = useMutation({
    mutationFn: (indexName: string) =>
      schemaService.dropIndex(
        resolvedConnection!.id,
        selectedItem!.name,
        indexName,
        currentSchema,
      ),
    onSuccess: () => {
      refreshExplorerData();
    },
  });

  const renameIndexMutation = useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) =>
      schemaService.renameIndex(
        resolvedConnection!.id,
        selectedItem!.name,
        oldName,
        newName,
        currentSchema,
      ),
    onSuccess: () => {
      refreshExplorerData();
    },
  });

  const dropForeignKeyMutation = useMutation({
    mutationFn: (constraintName: string) =>
      schemaService.dropForeignKey(
        resolvedConnection!.id,
        selectedItem!.name,
        constraintName,
        currentSchema,
      ),
    onSuccess: () => {
      refreshExplorerData();
    },
  });

  const renameForeignKeyMutation = useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) =>
      schemaService.renameForeignKey(
        resolvedConnection!.id,
        selectedItem!.name,
        oldName,
        newName,
        currentSchema,
      ),
    onSuccess: () => {
      refreshExplorerData();
    },
  });

  const dropConstraintMutation = useMutation({
    mutationFn: (constraintName: string) =>
      schemaService.dropConstraint(
        resolvedConnection!.id,
        selectedItem!.name,
        constraintName,
        currentSchema,
      ),
    onSuccess: () => {
      refreshExplorerData();
    },
  });

  const updateCell = useCallback(
    (row: DbRow, column: string, newValue: CellValue) => {
      if (!selectedItem || !resolvedConnection) return;

      if (resolvedConnection.environment === Environment.PRODUCTION) {
        toast(
          'Editing production data — changes are inside an open transaction. Use Commit to persist or Rollback to discard.',
          { icon: '⚠️', duration: 5000 },
        );
      }

      const primaryKeys = columns
        ?.filter((col) => col.isPrimaryKey)
        .map((col) => col.name) ?? [];

      const isExpr =
        typeof newValue === 'object' &&
        newValue !== null &&
        '__expr' in newValue;

      tauriApi
        .invoke('update_cell', {
          id: resolvedConnection.id,
          input: {
            schema: currentSchema,
            table: selectedItem.name,
            row,
            column,
            newValue,
            primaryKeys,
          },
        })
        .catch((err: unknown) => {
          console.error('Failed to update cell:', err);
          const message =
            err instanceof Error ? err.message : 'Failed to update cell.';
          toast.error(message, { duration: 5000 });
        });

      setSocketResults((prev: QueryResult | null) => {
        if (!prev) return prev;
        const prevRows = prev.rows as DbRow[];
        const matchedIndex = primaryKeys.length > 0
          ? prevRows.findIndex((r) => primaryKeys.every((pk) => r[pk] === row[pk]))
          : prevRows.indexOf(row);
        if (matchedIndex === -1) return prev;
        const newRows = [...prevRows];
        const optimisticValue: DbValue = isExpr
          ? (newValue as { __expr: string }).__expr
          : (newValue as DbValue);
        newRows[matchedIndex] = { ...prevRows[matchedIndex], [column]: optimisticValue };
        return { ...prev, rows: newRows } as QueryResult;
      });
    },
    [selectedItem, resolvedConnection, columns, currentSchema, setSocketResults],
  );

  const handleExecute = useCallback(
    async (useParams: boolean = false) => {
      if (selectedItem && resolvedConnection) {
        if (!useParams && parameters && parameters.length > 0) {
          setShowParamModal(true);
          return;
        }

        if (activeExplorerTabId) {
          updateExplorerTab(activeExplorerTabId, {
            executionStatus: ExecutionStatus.EXECUTING,
            executionError: null,
            socketResults: null,
          });
        }
        setShowParamModal(false);

        try {
          const store = useAppStore.getState();
          const tabId = activeExplorerTabId ?? store.explorer.activeExplorerTabId;
          const currentFilter = tabId ? store.explorerTabs[tabId]?.filter ?? '' : '';
          // Normaliza comillas dobles → simples para motores donde "..." es un
          // identificador (Postgres/SQL Server/SQLite), usando las columnas de
          // la tabla para no convertir identificadores reales.
          const normalizedFilter = normalizeFilterQuotes(
            currentFilter,
            (columns ?? []).map((c) => c.name),
            resolvedConnection.type as DatabaseType,
          );

          const result = await schemaService.executeExplorer({
            connectionId: resolvedConnection.id,
            database: currentSchema,
            name: selectedItem.name,
            objectType: selectedItem.type,
            page: page + 1,
            pageSize: pageSize,
            params: useParams ? paramValues : undefined,
            filter: normalizedFilter,
          });

          if (activeExplorerTabId) {
            updateExplorerTab(activeExplorerTabId, {
              socketResults: result,
              executionStatus: ExecutionStatus.SUCCESS,
              executionError: null,
            });
          }
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : 'Failed to execute query';
          if (activeExplorerTabId) {
            updateExplorerTab(activeExplorerTabId, {
              executionStatus: ExecutionStatus.ERROR,
              executionError: errorMessage,
              socketResults: null,
            });
          }
        }
      }
    },
    [
      selectedItem,
      resolvedConnection,
      pageSize,
      page,
      parameters,
      paramValues,
      currentSchema,
      updateExplorerTab,
      activeExplorerTabId,
      columns,
    ],
  );

  useEffect(() => {
    const isDataTable =
      selectedItem?.type === DatabaseObjectType.TABLE ||
      selectedItem?.type === DatabaseObjectType.VIEW;
    const isDataTab = activeTab === ExplorerTab.DATA;
    const needsExecution =
      isDataTable &&
      isDataTab &&
      executionStatus === ExecutionStatus.IDLE;

    if (needsExecution) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) handleExecute();
      });
      return () => { cancelled = true; };
    }
  }, [
    activeTab,
    executionStatus,
    handleExecute,
    selectedItem?.type,
    socketResults,
    page,
    pageSize,
  ]);

  const handleCancel = useCallback(() => {
    setExecutionStatus(ExecutionStatus.ERROR);
    setExecutionError('Query cancelled by user');
  }, [setExecutionStatus, setExecutionError]);

  const isLoadingSidebar =
    isLoadingTables ||
    isLoadingViews ||
    isLoadingProcedures ||
    isLoadingTriggers ||
    isLoadingFunctions;

  const filteredItems = useMemo(() => {
    let items: { name: string }[] | undefined;
    switch (sidebarTab) {
      case SidebarTab.TABLES:
        items = tables;
        break;
      case SidebarTab.VIEWS:
        items = views;
        break;
      case SidebarTab.PROCEDURES:
        items = procedures;
        break;
      case SidebarTab.TRIGGERS:
        items = triggers;
        break;
      case SidebarTab.FUNCTIONS:
        items = functions;
        break;
    }

    if (!items) return [];

    return items.filter((t) =>
      (t.name || '').toLowerCase().includes(search.toLowerCase()),
    );
  }, [sidebarTab, tables, views, procedures, triggers, functions, search]);

  // Resolve db type: prefer resolvedConnection.type (already stored), confirm from backend only if needed
  const dbType: DatabaseType | undefined = (() => {
    if (!resolvedConnection?.type) return undefined;
    switch (resolvedConnection.type) {
      case DatabaseType.MONGODB: return DatabaseType.MONGODB;
      case DatabaseType.SQLSERVER: return DatabaseType.SQLSERVER;
      case DatabaseType.POSTGRES: return DatabaseType.POSTGRES;
      case DatabaseType.MARIADB: return DatabaseType.MARIADB;
      default: return resolvedConnection.type as DatabaseType;
    }
  })();

  const isMongoDB = dbType === DatabaseType.MONGODB;

  return {
    activeConnection: resolvedConnection,
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
    renameForeignKeyMutation,
    dropConstraintMutation,
    updateCell,
    handleExecute,
    handleCancel,
    handleRefetch,
    refreshExplorerData,
    filter,
    setFilter,
    dbType,
    isMongoDB,
    explorerTabs,
    activeExplorerTabId,
    removeExplorerTab,
    setExplorerState,
    connections,
    connectedConnectionIds,
    switchExplorerConnection,
  };
}
