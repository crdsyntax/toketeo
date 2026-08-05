import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { EditorView } from '@codemirror/view'
import { useAppStore, type MongoFilterState, type QueryHistoryEntry, type EditorMode } from '@/store/useAppStore'
import { queryService } from '@/services/query.service'
import { schemaService } from '@/services/schema.service'
import { tauriApi } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { connectionService } from '@/services/connection.service'
import { toast } from 'react-hot-toast'
import type { DbValue, DbRow, Connection } from '@/types/database'
import { ExecutionStatus, Environment, DatabaseType } from '@/types/database'
import { isMongoShellSyntax, parseMongoShell } from '@/lib/mongoShellParser'
import { useGamificationStore } from '@/store/gamificationStore'
import { usePerformanceStore } from '@/store/performanceStore'
import { calculateQueryXp, hashQuery } from '@/lib/gamification'
import { onRunQueryRequested } from '@/lib/queryRunEvents'

const TABLE_NAME_REGEX = /FROM\s+([a-zA-Z0-9_.`"[\]]+)/i

const FK_VIOLATION_PATTERNS = [
  /violates foreign key constraint/i,
  /foreign key constraint fails/i,
  /conflicted with the REFERENCE constraint/i,
  /FOREIGN KEY constraint failed/i,
  /foreign key constraint/i,
]

function isFKViolation(message: string): boolean {
  return FK_VIOLATION_PATTERNS.some(p => p.test(message))
}

function extractTableFromQuery(query: string): string | null {
  const match = query.match(/DELETE\s+FROM\s+[`'"']?(\w+)[`'"']?/i)
  return match ? match[1] : null
}

const tryParseJson = (v: string): unknown => {
  if (!v.trim()) return undefined;
  try { return JSON.parse(v); } catch { return v; }
};

/**
 * Merge MongoFilterBar values into a parsed protocol object.
 * Filter bar values override any values already in the protocol.
 */
function mergeFilterBar(
  payload: Record<string, unknown>,
  mongoFilter: MongoFilterState | undefined,
): void {
  if (!mongoFilter) return;
  const find = tryParseJson(mongoFilter.find);
  const project = tryParseJson(mongoFilter.project);
  const sort = tryParseJson(mongoFilter.sort);
  const collation = tryParseJson(mongoFilter.collation);
  const hint = tryParseJson(mongoFilter.hint);
  if (find !== undefined) payload['find'] = find;
  if (project !== undefined) payload['project'] = project;
  if (sort !== undefined) payload['sort'] = sort;
  if (collation !== undefined) payload['collation'] = collation;
  if (hint !== undefined) payload['hint'] = hint;
}

function buildMongoJsonQuery(rawSql: string, mongoFilter: MongoFilterState | undefined, editorMode?: EditorMode): string {
  const cleaned = rawSql.replace(/;\s*$/, '').trim();
  const mode = editorMode ?? 'auto';

  if (mode === 'mongosh') {
    // Shell mode â€” pure shell parsing, NO filter bar merge, NO legacy fallback
    const parseResult = parseMongoShell(cleaned);
    if (parseResult.success) {
      const payload = parseResult.protocol as unknown as Record<string, unknown>;
      // Explicitly do NOT merge filter bar â€” user's query text is authoritative
      return JSON.stringify(payload);
    }
    // Parse failed â€” throw so the caller shows the error instead of sending garbage
    throw new Error(`Failed to parse MongoDB shell syntax:\n${parseResult.error}\n\n${cleaned}`);
  }

  if (mode === 'json') {
    // JSON mode â€” only try JSON protocol, no filter bar merge
    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && 'collection' in parsed) {
        // Do NOT merge filter bar â€” user's JSON is authoritative
        return JSON.stringify(parsed);
      }
      // Valid JSON but missing 'collection' key â€” send as generic MongoDB command
      return cleaned;
    } catch {
      throw new Error(`Invalid JSON for MongoDB command:\n${cleaned}`);
    }
  }

  // 'auto' â€” try JSON first, then shell, then legacy (with filter bar)
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && 'collection' in parsed) {
      mergeFilterBar(parsed, mongoFilter);
      return JSON.stringify(parsed);
    }
  } catch { /* not JSON â€” fall through */ }

  if (isMongoShellSyntax(cleaned)) {
    const parseResult = parseMongoShell(cleaned);
    if (parseResult.success) {
      const payload = parseResult.protocol as unknown as Record<string, unknown>;
      mergeFilterBar(payload, mongoFilter);
      return JSON.stringify(payload);
    }
    console.warn('[mongoShellParser] Parse failed:', parseResult.error);
  }

  // Legacy fallback (only reached in 'auto' mode)
  const dbShellMatch = cleaned.match(/db\.(\w+)/);
  const collectionName = dbShellMatch ? dbShellMatch[1] : 'unknown';

  const payload: Record<string, unknown> = {
    collection: collectionName,
    find: tryParseJson(mongoFilter?.find ?? '') ?? {},
  };
  const project = tryParseJson(mongoFilter?.project ?? '');
  const sort = tryParseJson(mongoFilter?.sort ?? '');
  const collation = tryParseJson(mongoFilter?.collation ?? '');
  const hint = tryParseJson(mongoFilter?.hint ?? '');
  if (project !== undefined) payload['project'] = project;
  if (sort !== undefined) payload['sort'] = sort;
  if (collation !== undefined) payload['collation'] = collation;
  if (hint !== undefined) payload['hint'] = hint;

  return JSON.stringify(payload);
}

export function useQueryEditor() {
  const { 
    activeConnection, 
    tabs, 
    activeTabId, 
    addTab, 
    openTab,
    removeTab, 
    updateTabQuery, 
    updateTabConnection,
    setActiveTabId, 
    updateTabResults, 
    clearTabResults,
    updateTabViewState,
    updateTabMongoFilter,
    updateTabEditorMode,
    panels, 
    setEditorHeight,
    togglePanel,
    addQueryHistory,
    queryHistory,
    clearQueryHistory,
    setActiveConnectionDatabase,
  } = useAppStore()
  
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]
  
  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  })
  
  const [showContextMenu, setShowContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null)
  const [showLayoutMenu, setShowLayoutMenu] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [modalRect, setModalRect] = useState({ x: 10, y: 10, w: 80, h: 80 }) 
  const [isMaximized, setIsMaximized] = useState(false)
  const [prevRect, setPrevRect] = useState({ x: 10, y: 10, w: 80, h: 80 })
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string; value: DbValue } | null>(null)
  const [pendingEdit, setPendingEdit] = useState<{ rowIndex: number; column: string; prevValue: DbValue; nextValue: DbValue } | null>(null)
  const [isInteracting, setIsInteracting] = useState(false)
  const lastExecutedSqlRef = useRef('')
  const [tabHistory, setTabHistory] = useState<Record<string, { history: { rowIndex: number; col: string; prev: DbValue; next: DbValue }[]; historyIndex: number }>>({})
  const [contextMenuSql, setContextMenuSql] = useState<{ x: number, y: number, row: DbRow } | null>(null)
  const [sqlModal, setSqlModal] = useState<{ isOpen: boolean; sql: string }>({ isOpen: false, sql: '' })
  const [queryLimit, setQueryLimit] = useState<number>(100)
  const [safeDeleteSuggestion, setSafeDeleteSuggestion] = useState<string | null>(null)

  const draggingRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null)
  const resizingRef = useRef<{ startX: number; startY: number; startSize: { w: number; h: number } } | null>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const dragging = draggingRef.current
      if (dragging) {
        setIsInteracting(true)
        const deltaX = ((e.clientX - dragging.startX) / window.innerWidth) * 100
        const deltaY = ((e.clientY - dragging.startY) / window.innerHeight) * 100
        setModalRect(prev => ({
          ...prev,
          x: dragging.startPos.x + deltaX,
          y: dragging.startPos.y + deltaY
        }))
      }
      const resizing = resizingRef.current
      if (resizing) {
        setIsInteracting(true)
        const deltaX = ((e.clientX - resizing.startX) / window.innerWidth) * 100
        const deltaY = ((e.clientY - resizing.startY) / window.innerHeight) * 100
        setModalRect(prev => ({
          ...prev,
          w: Math.max(20, resizing.startSize.w + deltaX),
          h: Math.max(20, resizing.startSize.h + deltaY)
        }))
      }
    }
    const handleMouseUp = () => {
      draggingRef.current = null
      resizingRef.current = null
      setIsInteracting(false)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const editorRef = useRef<EditorView | null>(null)

  const checkDangerousQuery = useCallback((sql: string, isMongo: boolean, connection?: Connection | null): boolean => {
    if (isMongo) {
      const isProduction = connection?.environment?.toLowerCase() === Environment.PRODUCTION;
      if (!isProduction) return false;

      // MongoDB destructive operations regex
      const destructive = /\.\s*(updateMany|updateOne|deleteMany|deleteOne|findOneAndDelete|findOneAndUpdate|replaceOne|drop|remove|bulkWrite|insertMany|insertOne|save)\s*\(/i;
      if (destructive.test(sql)) {
        return !window.confirm(
          'Warning: This MongoDB operation modifies data on a PRODUCTION database.\n' +
          'Are you sure you want to proceed?'
        );
      }
      return false;
    }

    // SQL danger check
    const upperSql = sql.toUpperCase()
    const hasUpdate = upperSql.includes('UPDATE')
    const hasDelete = upperSql.includes('DELETE')
    const hasWhere = upperSql.includes('WHERE')
    const isProduction = connection?.environment?.toLowerCase() === Environment.PRODUCTION;

    // In production, ANY UPDATE/DELETE requires confirmation
    if (isProduction && (hasUpdate || hasDelete)) {
      return !window.confirm(
        'Warning: This query modifies data on a PRODUCTION database.\n' +
        'Are you sure you want to proceed?'
      )
    }

    // For any environment, UPDATE/DELETE without WHERE clause requires confirmation
    if ((hasUpdate || hasDelete) && !hasWhere) {
      return !window.confirm('Warning: This query contains an UPDATE or DELETE statement without a WHERE clause. Are you sure you want to proceed?')
    }

    return false
  }, [])

  const { trackAction, addXP, isQueryFirstTime, markQueryExecuted } = useGamificationStore()

  const handleExecuteAll = useCallback(async (page: number = 1, limit?: number, overrideSql?: string) => {
    const raw = overrideSql?.trim() ?? activeTab?.query
    if (!raw) return
    const targetConnectionId = activeTab.connectionId || activeConnection?.id;
    const targetConnection = activeConnection && activeConnection.id === targetConnectionId
      ? activeConnection
      : (connections.find(c => c.id === targetConnectionId) || activeConnection || null);
    if (!targetConnection) {
      setSafeDeleteSuggestion(null)
      updateTabResults(activeTab.id, {
        status: ExecutionStatus.ERROR,
        error: 'No connection selected. Select a connection in the toolbar to execute this query.',
      })
      return
    }
    setSafeDeleteSuggestion(null)
    const isMongo = targetConnection.type === DatabaseType.MONGODB;
    if (checkDangerousQuery(raw, isMongo, targetConnection)) return

      const effectiveLimit = limit ?? queryLimit;
      let sql = raw;

      if (isMongo) {
        sql = buildMongoJsonQuery(sql, activeTab.mongoFilter, activeTab.editorMode);
      } else {
        const isSelect = /^\s*(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN|CALL)\b/i.test(sql);
        if (page > 1 && !isSelect) {
          updateTabResults(activeTab.id, {
            status: ExecutionStatus.ERROR,
            error: 'Pagination is only supported for SELECT queries.',
          });
          return;
        }
        if (isSelect && !/LIMIT\s+(?:\d+|ALL)/i.test(sql) && effectiveLimit > 0) {
          const offset = (page - 1) * effectiveLimit;
          const limitStr = offset > 0 ? ` LIMIT ${effectiveLimit} OFFSET ${offset}` : ` LIMIT ${effectiveLimit}`;
          if (sql.endsWith(';')) {
            sql = sql.slice(0, -1).trim() + limitStr + ';';
          } else {
            sql += limitStr;
          }
        }
      }
      if (!isMongo) sql = sql.endsWith(';') ? sql : `${sql};`;
      lastExecutedSqlRef.current = sql;

      updateTabResults(activeTab.id, { status: ExecutionStatus.EXECUTING, error: null, results: page === 1 ? null : activeTab.results })

      const startTime = Date.now();
      try {
        // Use the connection's database/schema, falling back to the active connection's
        // selected schema (important for PostgreSQL where the schema is set in the sidebar).
        const schema = targetConnection.database || activeConnection?.database;
        
        let result;
        try {
          result = await queryService.execute(targetConnection.id, sql, schema, undefined, page, effectiveLimit > 0 ? effectiveLimit : undefined);
        } catch (err: unknown) {
          const isConnNotFound = err instanceof Error && err.message.includes('not found') && err.message.includes('Connection');
          if (isConnNotFound) {
            await connectionService.reconnect(targetConnection.id);
            result = await queryService.execute(targetConnection.id, sql, schema, undefined, page, effectiveLimit > 0 ? effectiveLimit : undefined);
          } else {
            throw err;
          }
        }

        result.page = page;
        result.hasMore = effectiveLimit > 0 && result.rows.length >= effectiveLimit;
        const durationMs = Date.now() - startTime;
        updateTabResults(activeTab.id, {
          status: ExecutionStatus.SUCCESS,
          results: result,
          error: null
        });
        toast.success(`Query returned successfully in ${durationMs} ms`);

        // Handle MongoDB use <db> â€” update connection's active database
        if (isMongo) {
          const useMatch = raw.match(/^\s*use\s+([^\s;]+)\s*;?\s*$/i);
          if (useMatch) {
            setActiveConnectionDatabase(useMatch[1]);
          }
        }

        const qHash = hashQuery(sql);
        const isFirstTime = isQueryFirstTime(qHash);
        const xpEarned = calculateQueryXp(sql, isFirstTime);
        addXP(xpEarned);
        if (isFirstTime) markQueryExecuted(qHash);
        trackAction('EXECUTE_QUERY');
        const histEntry: QueryHistoryEntry = {
          id: Math.random().toString(36).substring(2),
          query: raw,
          connectionId: targetConnection.id,
          executedAt: Date.now(),
          durationMs,
          status: 'success',
          rowCount: result.rows.length,
        };
        addQueryHistory(histEntry);
        schemaService.saveQueryHistory([histEntry]).catch(() => undefined)
        usePerformanceStore.getState().addRecord({
          id: histEntry.id,
          connectionId: targetConnection.id,
          sql: raw,
          durationMs,
          rowsReturned: result.rows.length,
          executedAt: Date.now(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const durationMs = Date.now() - startTime;
        updateTabResults(activeTab.id, {
          status: ExecutionStatus.ERROR,
          error: message
        });
        const histEntry: QueryHistoryEntry = {
          id: Math.random().toString(36).substring(2),
          query: raw,
          connectionId: targetConnection.id,
          executedAt: Date.now(),
          durationMs,
          status: 'error',
          error: message,
        };
        addQueryHistory(histEntry);
        schemaService.saveQueryHistory([histEntry]).catch(() => undefined)

        // Auto-detect FK violation and generate safe delete suggestion
        if (isFKViolation(message) && targetConnection) {
          const table = extractTableFromQuery(raw)
          if (table) {
            try {
              const safeSql = await schemaService.generateSafeDeleteSql(
                targetConnection.id,
                table,
                targetConnection.database,
              )
              setSafeDeleteSuggestion(safeSql)
            } catch {
              // silent â€” suggestion is optional
            }
          }
        }
      }
  }, [activeTab, activeConnection, connections, updateTabResults, checkDangerousQuery, queryLimit, addQueryHistory, addXP, isQueryFirstTime, markQueryExecuted, trackAction, setActiveConnectionDatabase])

  // Run a query requested from the assistant into the active editor tab.
  useEffect(() => {
    return onRunQueryRequested((sql) => {
      const tabId = useAppStore.getState().activeTabId
      if (!tabId) return
      updateTabQuery(tabId, sql)
      handleExecuteAll(1, undefined, sql)
    })
  }, [handleExecuteAll, updateTabQuery])

  const handleExecuteCurrent = useCallback(async (page = 1) => {
    const view = editorRef.current
    if (!view || !activeTab) return
    setSafeDeleteSuggestion(null)

    const fullText = view.state.doc.toString()
    const mainSel = view.state.selection.main
    const cursorPos = mainSel.head
    let sqlSnippet: string

    if (!mainSel.empty) {
      sqlSnippet = view.state.sliceDoc(mainSel.from, mainSel.to)
    } else {
      // Execute the statement at the cursor: the text bounded by the previous ';'
      // (or start of file) and the next ';' at/after the cursor (or end of file).
      let start = 0
      for (let i = cursorPos - 1; i >= 0; i--) {
        if (fullText[i] === ';') {
          start = i + 1
          break
        }
      }

      let end = fullText.length - 1
      for (let i = cursorPos; i < fullText.length; i++) {
        if (fullText[i] === ';') {
          end = i
          break
        }
      }

      sqlSnippet = fullText.slice(start, end + 1).trim()

      // Cursor over blank whitespace (e.g. right after a trailing ';'): fall
      // back to the preceding statement so Ctrl+Enter still runs the finished query.
      if (!sqlSnippet) {
        start = fullText.lastIndexOf(';', Math.max(0, start - 2)) + 1
        sqlSnippet = fullText.slice(start, end + 1).trim()
      }
    }

    if (!sqlSnippet) return

    const targetConnectionId = activeTab.connectionId || activeConnection?.id;
    const targetConnection = activeConnection && activeConnection.id === targetConnectionId
      ? activeConnection
      : (connections.find(c => c.id === targetConnectionId) || activeConnection || null);
    if (!targetConnection) {
      updateTabResults(activeTab.id, {
        status: ExecutionStatus.ERROR,
        error: 'No connection selected. Select a connection in the toolbar to execute this query.',
      })
      return
    }

    const isMongo = targetConnection.type === 'mongodb';
    if (checkDangerousQuery(sqlSnippet, isMongo, targetConnection)) return

    sqlSnippet = sqlSnippet.trim();
    if (isMongo) {
      sqlSnippet = buildMongoJsonQuery(sqlSnippet, activeTab.mongoFilter, activeTab.editorMode);
    } else {
      const isSelect = /^\s*(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN|CALL)\b/i.test(sqlSnippet);
      if (page > 1 && !isSelect) {
        updateTabResults(activeTab.id, {
          status: ExecutionStatus.ERROR,
          error: 'Pagination is only supported for SELECT queries.',
        });
        return;
      }
      if (isSelect && !/LIMIT\s+(?:\d+|ALL)/i.test(sqlSnippet) && queryLimit > 0) {
        const offset = (page - 1) * queryLimit;
        const limitStr = offset > 0 ? ` LIMIT ${queryLimit} OFFSET ${offset}` : ` LIMIT ${queryLimit}`;
        if (sqlSnippet.endsWith(';')) {
          sqlSnippet = sqlSnippet.slice(0, -1).trim() + limitStr + ';';
        } else {
          sqlSnippet += limitStr;
        }
      }
    }
    if (!isMongo && !sqlSnippet.endsWith(';')) sqlSnippet += ';'
    lastExecutedSqlRef.current = sqlSnippet;

    updateTabResults(activeTab.id, { status: ExecutionStatus.EXECUTING, error: null, results: page === 1 ? null : activeTab.results })
    const startTime = Date.now();
    
    try {
      const schema = targetConnection.database || activeConnection?.database;
      
      let result;
      try {
        result = await queryService.execute(targetConnection.id, sqlSnippet, schema, undefined, page, queryLimit > 0 ? queryLimit : undefined);
      } catch (err: unknown) {
        const isConnNotFound = err instanceof Error && err.message.includes('not found') && err.message.includes('Connection');
        if (isConnNotFound) {
          await connectionService.reconnect(targetConnection.id);
          result = await queryService.execute(targetConnection.id, sqlSnippet, schema, undefined, page, queryLimit > 0 ? queryLimit : undefined);
        } else {
          throw err;
        }
      }

      result.page = page;
      result.hasMore = queryLimit > 0 && result.rows.length >= queryLimit;
      updateTabResults(activeTab.id, {
        status: ExecutionStatus.SUCCESS,
        results: result,
        error: null
      })
      const durationMs = Date.now() - startTime;
      toast.success(`Query returned successfully in ${durationMs} ms`);

      // Handle MongoDB use <db> â€” update connection's active database
      if (isMongo) {
        const useMatch = (activeTab?.query ?? sqlSnippet).trim().match(/^\s*use\s+([^\s;]+)\s*;?\s*$/i);
        if (useMatch) {
          setActiveConnectionDatabase(useMatch[1]);
        }
      }

      const qHash = hashQuery(sqlSnippet);
      const isFirstTime = isQueryFirstTime(qHash);
      const xpEarned = calculateQueryXp(sqlSnippet, isFirstTime);
      addXP(xpEarned);
      if (isFirstTime) markQueryExecuted(qHash);
      trackAction('EXECUTE_QUERY');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      updateTabResults(activeTab.id, {
        status: ExecutionStatus.ERROR,
        error: message
      })

      // Auto-detect FK violation and generate safe delete suggestion
      if (isFKViolation(message) && targetConnection) {
        const table = extractTableFromQuery(sqlSnippet)
        if (table) {
          try {
            const safeSql = await schemaService.generateSafeDeleteSql(
              targetConnection.id,
              table,
              targetConnection.database,
            )
            setSafeDeleteSuggestion(safeSql)
          } catch {
            // silent â€” suggestion is optional
          }
        }
      }
    }
  }, [activeTab, activeConnection, connections, updateTabResults, checkDangerousQuery, queryLimit, addXP, isQueryFirstTime, markQueryExecuted, trackAction, setActiveConnectionDatabase])

  // Use refs to avoid stale closures in editor keybindings
  const executeCurrentRef = useRef(handleExecuteCurrent)
  const executeAllRef = useRef(handleExecuteAll)
  
  useEffect(() => {
    executeCurrentRef.current = handleExecuteCurrent
    executeAllRef.current = handleExecuteAll
  }, [handleExecuteCurrent, handleExecuteAll])

  const handleCancel = useCallback(() => {
    if (activeTabId) {
      const tab = tabs.find(t => t.id === activeTabId);
      const connId = tab?.connectionId || activeConnection?.id;
      if (!connId) return;
      updateTabResults(activeTabId, { 
        status: ExecutionStatus.ERROR, 
        error: 'Query cancelled by user',
        results: null 
      })
      queryService.cancel(connId)
    }
  }, [activeTabId, tabs, activeConnection, updateTabResults])

  const updateCell = useCallback(async (rowIndex: number, column: string, newValue: DbValue, isUndoRedo: boolean = false) => {
    if (!activeTab?.results) return
    const targetConnectionId = activeTab.connectionId || activeConnection?.id;
    const targetConnection = activeConnection && activeConnection.id === targetConnectionId
      ? activeConnection
      : (connections.find(c => c.id === targetConnectionId) || activeConnection || null);
    if (!targetConnection) return

    if (targetConnection.environment === Environment.PRODUCTION && !isUndoRedo) {
      toast(
        'Editing production data â€” changes are inside an open transaction. Use Commit to persist or Rollback to discard.',
        { icon: 'âš ï¸', duration: 5000 },
      );
    }

    const row = activeTab.results.rows[rowIndex]
    const prevValue = row[column]
    
    // Use primary_keys metadata from backend if available, fallback to 'id'
    const pkColumns = activeTab.results.primary_keys && activeTab.results.primary_keys.length > 0 
      ? activeTab.results.primary_keys 
      : activeTab.results.columns.filter(c => c.toLowerCase() === 'id')

    if (pkColumns.length === 0) {
      updateTabResults(activeTab.id, { 
        status: ExecutionStatus.ERROR, 
        error: 'Cannot update: Primary key (or ID column) not found in result set.' 
      })
      setEditingCell(null)
      return
    }

    const tableNameMatch = (lastExecutedSqlRef.current || activeTab.query).match(TABLE_NAME_REGEX)
    let tableName = tableNameMatch ? tableNameMatch[1] : null

    if (!tableName) {
      updateTabResults(activeTab.id, { 
        status: ExecutionStatus.ERROR, 
        error: 'Cannot update: Table name not found in query.' 
      })
      setEditingCell(null)
      return
    }

    // Ensure tableName is escaped properly if it isn't
    if (!tableName.startsWith('`') && !tableName.startsWith('"') && !tableName.startsWith('[')) {
        tableName = `\`${tableName.replace(/\./g, '`.`')}\``
    }

    // Build WHERE clause using all PK columns
    const whereClauses = pkColumns.map((pk: string) => `\`${pk.replace(/`/g, "``")}\` = ?`).join(' AND ')
    const pkValues = pkColumns.map((pk: string) => row[pk])

    if (pkValues.some((v: DbValue) => v === null || v === undefined)) {
       updateTabResults(activeTab.id, { 
        status: ExecutionStatus.ERROR, 
        error: 'Cannot update: Primary key value is null or undefined.' 
      })
      setEditingCell(null)
      return
    }

    const updateSqlTemplate = `UPDATE ${tableName} SET \`${column.replace(/`/g, "``")}\` = ? WHERE ${whereClauses};`
    const params = [newValue, ...pkValues]

    const finalSql = updateSqlTemplate.replace(/\?/g, () => {
      const val = params.shift();
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
      return String(val);
    });

    const updatedRows = [...activeTab.results.rows]
    updatedRows[rowIndex] = { ...updatedRows[rowIndex], [column]: newValue }
    
    updateTabResults(activeTab.id, { 
      results: { ...activeTab.results, rows: updatedRows },
      status: ExecutionStatus.EXECUTING,
      error: null
    })

    try {
        const schema = targetConnection.database || activeConnection?.database;

        const runUpdate = async () => {
            await tauriApi.invoke('execute_query', {
                id: targetConnection.id,
                query: finalSql,
                ...(schema ? { schema } : {})
            });
        };

        try {
            await runUpdate();
        } catch (err: unknown) {
            const isConnNotFound = err instanceof Error && err.message.includes('not found') && err.message.includes('Connection');
            if (isConnNotFound) {
                await connectionService.reconnect(targetConnection.id);
                await runUpdate();
            } else {
                throw err;
            }
        }
        
        updateTabResults(activeTab.id, { status: ExecutionStatus.SUCCESS, error: null })
        addXP(10); // Base XP for edit
        trackAction('EDIT_ROW');
        
        if (!isUndoRedo) {
          setTabHistory(prev => {
            const state = prev[activeTab.id] || { history: [], historyIndex: -1 }
            const newHistory = state.history.slice(0, state.historyIndex + 1)
            newHistory.push({ rowIndex, col: column, prev: prevValue, next: newValue })
            return { ...prev, [activeTab.id]: { history: newHistory, historyIndex: newHistory.length - 1 } }
          })
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update record'
        updateTabResults(activeTab.id, { 
            status: ExecutionStatus.ERROR, 
            error: errorMessage 
        })
        // Revert local state on error
        updateTabResults(activeTab.id, { 
          results: { ...activeTab.results, rows: activeTab.results.rows },
        })
    }
    
    setEditingCell(null)
  }, [activeTab, activeConnection, connections, updateTabResults, addXP, trackAction])

  const handleSave = useCallback(async () => {
    if (!editingCell) return
    // When the Review Change panel is disabled (Settings â†’ Query Editor â†’
    // Inline edition), apply the edit immediately.
    if (!useAppStore.getState().inlineEditReview) {
      await updateCell(editingCell.rowIndex, editingCell.column, editingCell.value)
      return
    }
    // Stage the edit so the user can review the diff before committing.
    const row = activeTab?.results?.rows[editingCell.rowIndex]
    const prevValue = row ? row[editingCell.column] : null
    setPendingEdit({
      rowIndex: editingCell.rowIndex,
      column: editingCell.column,
      prevValue,
      nextValue: editingCell.value,
    })
    setEditingCell(null)
  }, [editingCell, updateCell, activeTab])

  const confirmPendingEdit = useCallback(async () => {
    if (!pendingEdit) return
    await updateCell(pendingEdit.rowIndex, pendingEdit.column, pendingEdit.nextValue)
    setPendingEdit(null)
  }, [pendingEdit, updateCell])

  const discardPendingEdit = useCallback(() => {
    setPendingEdit(null)
  }, [])

  const undo = useCallback(() => {
    if (!activeTabId) return;
    const { history, historyIndex } = tabHistory[activeTabId] || { history: [], historyIndex: -1 }
    if (historyIndex >= 0) {
      const change = history[historyIndex];
      updateCell(change.rowIndex, change.col, change.prev, true);
      setTabHistory(prev => ({
        ...prev,
        [activeTabId]: { history, historyIndex: historyIndex - 1 }
      }))
    }
  }, [activeTabId, tabHistory, updateCell]);

  const redo = useCallback(() => {
    if (!activeTabId) return;
    const { history, historyIndex } = tabHistory[activeTabId] || { history: [], historyIndex: -1 }
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const change = history[nextIndex];
      updateCell(change.rowIndex, change.col, change.next, true);
      setTabHistory(prev => ({
        ...prev,
        [activeTabId]: { history, historyIndex: nextIndex }
      }))
    }
  }, [activeTabId, tabHistory, updateCell]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || (e.key === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleGenerateSql = useCallback(async (action: string) => {
    if (!contextMenuSql || !activeTab?.results) return;

    const targetConnectionId = activeTab.connectionId || activeConnection?.id;
    const targetConnection = activeConnection && activeConnection.id === targetConnectionId
      ? activeConnection
      : (connections.find(c => c.id === targetConnectionId) || activeConnection || null);
    if (!targetConnection) return;

    const tableNameMatch = activeTab.query.match(TABLE_NAME_REGEX)
    let tableName = tableNameMatch ? tableNameMatch[1] : null
    
    if (!tableName) {
      updateTabResults(activeTab.id, { 
        status: ExecutionStatus.ERROR, 
        error: 'Cannot generate SQL: Table name not found in query.' 
      })
      setContextMenuSql(null)
      return
    }

    if (!tableName.startsWith('`') && !tableName.startsWith('"') && !tableName.startsWith('[')) {
        tableName = `\`${tableName.replace(/\./g, '`.`')}\``
    }

    const pks = activeTab.results.primary_keys || [];
    const primary_keys = pks.reduce(
      (acc, pk) => {
        if (contextMenuSql.row[pk] !== undefined) acc[pk] = contextMenuSql.row[pk];
        return acc;
      },
      {} as Record<string, DbValue>,
    );

    try {
      if (action === 'json') {
        const jsonStr = JSON.stringify(contextMenuSql.row, null, 2);
        setSqlModal({ isOpen: true, sql: jsonStr });
      } else {
        const sql = await tauriApi.invoke<string>('generate_sql', {
          id: targetConnection.id,
          action,
          context: {
            table: tableName,
            primary_keys,
            data: contextMenuSql.row,
          },
        });
        setSqlModal({ isOpen: true, sql });
      }
    } catch (e) {
      console.error('Failed to generate SQL:', e);
    } finally {
      setContextMenuSql(null);
    }
  }, [contextMenuSql, activeConnection, connections, activeTab, updateTabResults]);

  const sortedRows = useMemo(() => {
    const rows = activeTab?.results?.rows;
    if (!rows) return []
    if (!sortConfig) return rows

    return [...rows].sort((a, b) => {
      const aVal = a[sortConfig.key]
      const bVal = b[sortConfig.key]
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [activeTab?.results?.rows, sortConfig])

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const toggleMaximize = () => {
    if (isMaximized) {
      setModalRect(prevRect)
      setIsMaximized(false)
    } else {
      setPrevRect(modalRect)
      setModalRect({ x: 0, y: 0, w: 100, h: 100 })
      setIsMaximized(true)
    }
  }

  const handleSaveScript = useCallback(async () => {
    const state = useAppStore.getState();
    const currentTab = state.tabs.find(t => t.id === state.activeTabId) || state.tabs[0];
    
    const content = editorRef.current ? editorRef.current.state.doc.toString() : currentTab?.query;
    if (!content) return;

    try {
      await tauriApi.invoke('save_file_dialog', {
        content,
        defaultFileName: `${currentTab?.name || 'query'}.sql`,
        filterName: 'SQL Files',
        filterExt: 'sql',
      });
    } catch (e) {
      console.error('Failed to save script:', e);
    }
  }, []) // No dependencies

  const saveScriptRef = useRef(handleSaveScript)
  useEffect(() => {
    saveScriptRef.current = handleSaveScript
  }, [handleSaveScript])

  const handlePageChange = useCallback((page: number) => {
    handleExecuteAll(page)
  }, [handleExecuteAll])

  return {
    activeConnection,
    tabs,
    activeTabId,
    activeTab,
    addTab,
    openTab,
    removeTab,
    updateTabQuery,
    updateTabConnection,
    setActiveTabId,
    updateTabResults,
    panels,
    setEditorHeight,
    togglePanel,
    showContextMenu,
    setShowContextMenu,
    showLayoutMenu,
    setShowLayoutMenu,
    showResultModal,
    setShowResultModal,
    sortConfig,
    requestSort,
    sortedRows,
    modalRect,
    setModalRect,
    isMaximized,
    setIsMaximized,
    toggleMaximize,
    editingCell,
    setEditingCell,
    pendingEdit,
    confirmPendingEdit,
    discardPendingEdit,
    handleExecuteAll,
    handleExecuteCurrent,
    handleCancel,
    handleSave,
    handleSaveScript,
    editorRef,
    executeCurrentRef,
    executeAllRef,
    handlePageChange,
    clearTabResults,
    isInteracting,
    draggingRef,
    resizingRef,
    contextMenuSql,
    setContextMenuSql,
    sqlModal,
    setSqlModal,
    handleGenerateSql,
    updateTabViewState,
    updateTabMongoFilter,
    updateTabEditorMode,
    queryLimit,
    setQueryLimit,
    queryHistory,
    clearQueryHistory,
    safeDeleteSuggestion,
    setSafeDeleteSuggestion,
  }
}
