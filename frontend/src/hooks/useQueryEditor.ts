import type * as monaco from 'monaco-editor'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { Monaco } from '@monaco-editor/react'
import { useAppStore, type MongoFilterState, type QueryHistoryEntry } from '@/store/useAppStore'
import { queryService } from '@/services/query.service'
import { tauriApi } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { connectionService } from '@/services/connection.service'
import type { DbValue, DbRow } from '@/types/database'
import { ExecutionStatus } from '@/types/database'
import { isMongoShellSyntax, parseMongoShell } from '@/lib/mongoShellParser'
import { useGamificationStore } from '@/store/gamificationStore'
import { calculateQueryXp } from '@/lib/gamificationConfig'

const TABLE_NAME_REGEX = /FROM\s+([a-zA-Z0-9_.`"[\]]+)/i

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

function buildMongoJsonQuery(rawSql: string, mongoFilter: MongoFilterState | undefined): string {
  const cleaned = rawSql.replace(/;\s*$/, '').trim();

  // ── 1. Already structured JSON protocol ──────────────────────────────────
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && 'collection' in parsed) {
      mergeFilterBar(parsed, mongoFilter);
      return JSON.stringify(parsed);
    }
  } catch { /* not JSON — fall through */ }

  // ── 2. MongoDB Shell syntax (db.collection.method(...)) ──────────────────
  if (isMongoShellSyntax(cleaned)) {
    const parseResult = parseMongoShell(cleaned);
    if (parseResult.success) {
      const payload = parseResult.protocol as unknown as Record<string, unknown>;
      mergeFilterBar(payload, mongoFilter);
      return JSON.stringify(payload);
    }
    // Shell syntax detected but failed to parse: fall through to legacy handler
    console.warn('[mongoShellParser] Parse failed:', parseResult.error);
  }

  // ── 3. Legacy fallback: bare identifier / unknown format ─────────────────
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
    panels, 
    setEditorHeight,
    togglePanel,
    addQueryHistory,
    queryHistory,
    clearQueryHistory,
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
  const [isInteracting, setIsInteracting] = useState(false)
  const [tabHistory, setTabHistory] = useState<Record<string, { history: { rowIndex: number; col: string; prev: DbValue; next: DbValue }[]; historyIndex: number }>>({})
  const [contextMenuSql, setContextMenuSql] = useState<{ x: number, y: number, row: DbRow } | null>(null)
  const [sqlModal, setSqlModal] = useState<{ isOpen: boolean; sql: string }>({ isOpen: false, sql: '' })
  const [queryLimit, setQueryLimit] = useState<number>(100)

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

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  const checkDangerousQuery = useCallback((sql: string): boolean => {
    const upperSql = sql.toUpperCase()
    const hasUpdate = upperSql.includes('UPDATE')
    const hasDelete = upperSql.includes('DELETE')
    const hasWhere = upperSql.includes('WHERE')

    if ((hasUpdate || hasDelete) && !hasWhere) {
      return !window.confirm('Warning: This query contains an UPDATE or DELETE statement without a WHERE clause. Are you sure you want to proceed?')
    }
    return false
  }, [])

  const { trackAction, addXP } = useGamificationStore()

  const handleExecuteAll = useCallback(async (page: number = 1, limit?: number) => {
    if (activeTab?.query && activeConnection) {
      if (checkDangerousQuery(activeTab.query)) return

      const effectiveLimit = limit ?? queryLimit;
      const isMongo = activeConnection.type === 'mongodb';
      let sql = activeTab.query.trim();

      if (isMongo) {
        sql = buildMongoJsonQuery(sql, activeTab.mongoFilter);
      } else if (/^\s*SELECT\b/i.test(sql) && !/LIMIT\s+(?:\d+|ALL)/i.test(sql) && effectiveLimit > 0) {
        const offset = (page - 1) * effectiveLimit;
        const limitStr = offset > 0 ? ` LIMIT ${effectiveLimit} OFFSET ${offset}` : ` LIMIT ${effectiveLimit}`;
        if (sql.endsWith(';')) {
          sql = sql.slice(0, -1).trim() + limitStr + ';';
        } else {
          sql += limitStr;
        }
      }
      if (!isMongo) sql = sql.endsWith(';') ? sql : `${sql};`;
      
      updateTabResults(activeTab.id, { status: ExecutionStatus.EXECUTING, error: null, results: page === 1 ? null : activeTab.results })

      const startTime = Date.now();
      try {
        const targetConnectionId = activeTab.connectionId || activeConnection.id;
        const targetConnection = connections.find(c => c.id === targetConnectionId) || activeConnection;
        
        let result;
        try {
          result = await queryService.execute(targetConnection.id, sql, targetConnection.database, undefined, page, effectiveLimit > 0 ? effectiveLimit : undefined);
        } catch (err: unknown) {
          const isConnNotFound = err instanceof Error && err.message.includes('not found') && err.message.includes('Connection');
          if (isConnNotFound) {
            await connectionService.connect(targetConnection);
            result = await queryService.execute(targetConnection.id, sql, targetConnection.database, undefined, page, effectiveLimit > 0 ? effectiveLimit : undefined);
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
        const xpEarned = calculateQueryXp(sql);
        addXP(xpEarned);
        trackAction('EXECUTE_QUERY');
        const histEntry: QueryHistoryEntry = {
          id: Math.random().toString(36).substring(2),
          query: activeTab.query.trim(),
          connectionId: targetConnection.id,
          executedAt: Date.now(),
          durationMs,
          status: 'success',
          rowCount: result.rows.length,
        };
        addQueryHistory(histEntry);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const durationMs = Date.now() - startTime;
        updateTabResults(activeTab.id, {
          status: ExecutionStatus.ERROR,
          error: message
        });
        const histEntry: QueryHistoryEntry = {
          id: Math.random().toString(36).substring(2),
          query: activeTab.query.trim(),
          connectionId: activeTab.connectionId || activeConnection.id,
          executedAt: Date.now(),
          durationMs,
          status: 'error',
          error: message,
        };
        addQueryHistory(histEntry);
      }
    }
  }, [activeTab, activeConnection, connections, updateTabResults, checkDangerousQuery, queryLimit, addQueryHistory])

  const handleExecuteCurrent = useCallback(async (page = 1) => {
    if (!editorRef.current || !activeTab || !activeConnection) return

    const position = editorRef.current.getPosition()
    if (!position) return

    const fullText = editorRef.current.getValue()
    const selection = editorRef.current.getSelection()
    let sqlSnippet: string
    
    if (selection && !selection.isEmpty()) {
      sqlSnippet = editorRef.current.getModel()?.getValueInRange(selection) || ''
    } else {
      // Improved logic: Find the SQL block bounded by semicolons or file start/end
      const lines = fullText.split('\n')
      const cursorLine = position.lineNumber - 1
      
      let startIdx = 0
      for (let i = cursorLine; i >= 0; i--) {
        if (lines[i].includes(';') && i < cursorLine) {
          startIdx = i + 1
          break
        }
      }
      
      let endIdx = lines.length - 1
      for (let i = cursorLine; i < lines.length; i++) {
        if (lines[i].includes(';')) {
          endIdx = i
          break
        }
      }
      
      sqlSnippet = lines.slice(startIdx, endIdx + 1).join('\n').trim()
    }

    if (!sqlSnippet) return
    if (checkDangerousQuery(sqlSnippet)) return

    const isMongo = activeConnection?.type === 'mongodb';
    sqlSnippet = sqlSnippet.trim();
    if (isMongo) {
      sqlSnippet = buildMongoJsonQuery(sqlSnippet, activeTab.mongoFilter);
    } else if (/^\s*SELECT\b/i.test(sqlSnippet) && !/LIMIT\s+(?:\d+|ALL)/i.test(sqlSnippet) && queryLimit > 0) {
      const offset = (page - 1) * queryLimit;
      const limitStr = offset > 0 ? ` LIMIT ${queryLimit} OFFSET ${offset}` : ` LIMIT ${queryLimit}`;
      if (sqlSnippet.endsWith(';')) {
        sqlSnippet = sqlSnippet.slice(0, -1).trim() + limitStr + ';';
      } else {
        sqlSnippet += limitStr;
      }
    }
    if (!isMongo && !sqlSnippet.endsWith(';')) sqlSnippet += ';'

    updateTabResults(activeTab.id, { status: ExecutionStatus.EXECUTING, error: null, results: page === 1 ? null : activeTab.results })
    
    try {
      const targetConnectionId = activeTab.connectionId || activeConnection.id;
      const targetConnection = connections.find(c => c.id === targetConnectionId) || activeConnection;
      
      let result;
      try {
        result = await queryService.execute(targetConnection.id, sqlSnippet, targetConnection.database, undefined, page, queryLimit > 0 ? queryLimit : undefined);
      } catch (err: unknown) {
        const isConnNotFound = err instanceof Error && err.message.includes('not found') && err.message.includes('Connection');
        if (isConnNotFound) {
          await connectionService.connect(targetConnection);
          result = await queryService.execute(targetConnection.id, sqlSnippet, targetConnection.database, undefined, page, queryLimit > 0 ? queryLimit : undefined);
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
      const xpEarned = calculateQueryXp(sqlSnippet);
      addXP(xpEarned);
      trackAction('EXECUTE_QUERY');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      updateTabResults(activeTab.id, {
        status: ExecutionStatus.ERROR,
        error: message
      })
    }
  }, [activeTab, activeConnection, connections, updateTabResults, checkDangerousQuery, queryLimit])

  // Use refs to avoid stale closures in Monaco addCommand
  const executeCurrentRef = useRef(handleExecuteCurrent)
  const executeAllRef = useRef(handleExecuteAll)
  
  useEffect(() => {
    executeCurrentRef.current = handleExecuteCurrent
    executeAllRef.current = handleExecuteAll
  }, [handleExecuteCurrent, handleExecuteAll])

  const handleCancel = useCallback(() => {
    if (activeTabId && activeConnection) {
      updateTabResults(activeTabId, { 
        status: ExecutionStatus.ERROR, 
        error: 'Query cancelled by user',
        results: null 
      })
      queryService.cancel(activeConnection.id)
    }
  }, [activeTabId, activeConnection, updateTabResults])

  const updateCell = useCallback(async (rowIndex: number, column: string, newValue: DbValue, isUndoRedo: boolean = false) => {
    if (!activeTab?.results || !activeConnection) return

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

    const tableNameMatch = activeTab.query.match(TABLE_NAME_REGEX)
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
        try {
            await tauriApi.invoke('execute_query', {
                id: activeConnection.id,
                query: finalSql
            })
        } catch (err: unknown) {
            const isConnNotFound = err instanceof Error && err.message.includes('not found') && err.message.includes('Connection');
            if (isConnNotFound) {
                const targetConnectionId = activeTab.connectionId || activeConnection.id;
                const targetConnection = connections.find(c => c.id === targetConnectionId) || activeConnection;
                await connectionService.connect(targetConnection);
                await tauriApi.invoke('execute_query', {
                    id: activeConnection.id,
                    query: finalSql
                })
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
  }, [activeTab, activeConnection, connections, updateTabResults])

  const handleSave = useCallback(async () => {
    if (!editingCell) return
    await updateCell(editingCell.rowIndex, editingCell.column, editingCell.value)
  }, [editingCell, updateCell])

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
    if (!contextMenuSql || !activeConnection || !activeTab?.results) return;

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
          id: activeConnection.id,
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
  }, [contextMenuSql, activeConnection, activeTab, updateTabResults]);

  const handleEditorWillMount = useCallback((monacoInstance: Monaco) => {
    const languages = monacoInstance.languages as typeof monacoInstance.languages & { sqlProviderRegistered?: boolean };
    if (languages.sqlProviderRegistered) return;
    languages.sqlProviderRegistered = true;

    monacoInstance.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model: monaco.editor.ITextModel, position: monaco.Position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions: monaco.languages.CompletionItem[] = [
          {
            label: 'SELECT',
            kind: 17, // CompletionItemKind.Snippet
            insertText: 'SELECT * FROM ${1:table_name} WHERE ${2:condition};',
            insertTextRules: 4, // CompletionItemInsertTextRule.InsertAsSnippet
            documentation: 'Basic SELECT statement',
            range: range,
          },
          {
            label: 'INSERT',
            kind: 17,
            insertText: 'INSERT INTO ${1:table_name} (${2:columns}) VALUES (${3:values});',
            insertTextRules: 4,
            documentation: 'Basic INSERT statement',
            range: range,
          },
          {
            label: 'UPDATE',
            kind: 17,
            insertText: 'UPDATE ${1:table_name} SET ${2:column} = ${3:value} WHERE ${4:condition};',
            insertTextRules: 4,
            documentation: 'Basic UPDATE statement',
            range: range,
          },
          {
            label: 'DELETE',
            kind: 17,
            insertText: 'DELETE FROM ${1:table_name} WHERE ${2:condition};',
            insertTextRules: 4,
            documentation: 'Basic DELETE statement',
            range: range,
          },
        ];
        return { suggestions };
      },
    });
  }, [])

  const handleEditorDidMount = useCallback((editorInstance: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorRef.current = editorInstance
    
    // Ctrl/Cmd + Enter: Execute Current Statement (or selection)
    editorInstance.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
      executeCurrentRef.current()
    })

    // F5: Execute All (Legacy SQL editor behavior)
    editorInstance.addCommand(monacoInstance.KeyCode.F5, () => {
      executeAllRef.current()
    })
  }, [])

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
    
    const content = editorRef.current ? editorRef.current.getValue() : currentTab?.query;
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
    handleExecuteAll,
    handleExecuteCurrent,
    handleCancel,
    handleSave,
    handleSaveScript,
    handleEditorWillMount,
    handleEditorDidMount,
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
    queryLimit,
    setQueryLimit,
    queryHistory,
    clearQueryHistory,
  }
}
