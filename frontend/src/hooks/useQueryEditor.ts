import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { EditorView } from '@codemirror/view'
import { useAppStore, type MongoFilterState, type QueryHistoryEntry, type EditorMode } from '@/store/useAppStore'
import { queryService, type ScriptDecision, type ScriptLiveStatement, type ScriptReport } from '@/services/query.service'
import { schemaService } from '@/services/schema.service'
import { tauriApi } from '@/lib/api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { connectionService } from '@/services/connection.service'
import { toast } from 'react-hot-toast'
import type { DbValue, DbRow, Connection } from '@/types/database'
import { ExecutionStatus, Environment, DatabaseType } from '@/types/database'
import { isMongoShellSyntax, parseMongoShell } from '@/lib/mongoShellParser'
import { useGamificationStore } from '@/store/gamificationStore'
import { usePerformanceStore } from '@/store/performanceStore'
import { calculateQueryXp, hashQuery } from '@/lib/gamification'
import { onRunQueryRequested } from '@/lib/queryRunEvents'
import { assistantService } from '@/services/assistant.service'
import type { SqlFixResult } from '@/types/assistant'
import { listen } from '@tauri-apps/api/event'
import { splitSqlStatements } from '@/lib/sqlScript'
import { extractStatementAtCursor } from '@/lib/sql-statement'
import type { ScriptErrorPrompt } from '@/components/query/ScriptErrorModal'
import { generateRowsWhereClause, quoteIdent, quoteTableName, generateSelectByIds, generateDeleteByIds, generateUpdateByIds, generateInsertRows } from '@/lib/sqlGenerator'
import { generateMongoCommand, extractMongoCollection, type MongoAction } from '@/lib/mongoGenerator'
import { coerceEditedDateValue } from '@/lib/formatCellValue'

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

const SQL_SYNTAX_ERROR_PATTERNS = [
  /you have an error in your sql syntax/i,
  /syntax error at or near/i,
  /incorrect syntax near/i,
  /syntax error near/i,
  /near "[^"]*": syntax error/i,
  /syntax error in/i,
]

function isSqlSyntaxError(message: string): boolean {
  return SQL_SYNTAX_ERROR_PATTERNS.some(p => p.test(message))
}

function isSchemaChangingQuery(sql: string): boolean {
  const upper = sql.toUpperCase();
  return (
    upper.includes('ALTER ') ||
    upper.includes('CREATE ') ||
    upper.includes('DROP ') ||
    upper.includes('TRUNCATE ') ||
    upper.includes('RENAME ') ||
    upper.includes('GRANT ') ||
    upper.includes('REVOKE ')
  );
}

function extractTableFromQuery(query: string): string | null {
  const match = query.match(/DELETE\s+FROM\s+[`'"`"]?(\w+)[`'"`"]?/i)
  return match ? match[1] : null
}

/** Extract the raw WHERE clause of a DELETE statement (without the leading WHERE keyword). */
function extractWhereClauseFromDelete(query: string): string | null {
  const match = query.match(/DELETE\s+FROM\s+[`'"`"]?\w+[`'"`"]?\s+WHERE\s+([\s\S]+)$/i)
  if (!match) return null
  let clause = match[1].trim()
  if (clause.endsWith(';')) clause = clause.slice(0, -1).trimEnd()
  return clause || null
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
    updateExplorerTab,
  } = useAppStore()
  const queryClient = useQueryClient()

  const refreshSchemaMetadata = useCallback((connectionId: string) => {
    schemaService.clearMetadataCache(connectionId).catch(() => undefined)
    queryClient.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) && q.queryKey.includes(connectionId),
    })
    for (const [id, tab] of Object.entries(useAppStore.getState().explorerTabs)) {
      if (tab.connectionId === connectionId) {
        updateExplorerTab(id, {
          executionStatus: ExecutionStatus.IDLE,
          socketResults: null,
        })
      }
    }
  }, [queryClient, updateExplorerTab])
  
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
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<Set<number>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null)
  const lastExecutedSqlRef = useRef('')
  const [tabHistory, setTabHistory] = useState<Record<string, { history: { rowIndex: number; col: string; prev: DbValue; next: DbValue }[]; historyIndex: number }>>({})
  const [contextMenuSql, setContextMenuSql] = useState<{ x: number, y: number, row: DbRow } | null>(null)
  const [sqlModal, setSqlModal] = useState<{ isOpen: boolean; sql: string }>({ isOpen: false, sql: '' })
  const [queryLimit, setQueryLimit] = useState<number>(100)
  const [safeDeleteSuggestion, setSafeDeleteSuggestion] = useState<string | null>(null)
  const [sqlFixSuggestion, setSqlFixSuggestion] = useState<SqlFixResult | null>(null)
  const [sqlFixLoading, setSqlFixLoading] = useState(false)
  const [scriptPrompt, setScriptPrompt] = useState<ScriptErrorPrompt | null>(null)
  const [scriptSummary, setScriptSummary] = useState<ScriptReport | null>(null)
  const [scriptResponding, setScriptResponding] = useState(false)
  const [scriptLive, setScriptLive] = useState<ScriptLiveStatement[] | null>(null)
  const [lastScriptSql, setLastScriptSql] = useState<string[]>([])
  const activeScriptRunIdRef = useRef<string | null>(null)

  // Tracks an open transaction (BEGIN executed without COMMIT/ROLLBACK)
  const [openTransaction, setOpenTransaction] = useState<{ connectionId: string; startedAt: number } | null>(null)

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

  const fetchSqlFix = useCallback(async (connectionId: string, sql: string, errorMessage: string) => {
    setSqlFixLoading(true)
    setSqlFixSuggestion(null)
    try {
      const res = await assistantService.fixSql(connectionId, sql, errorMessage)
      setSqlFixSuggestion(res)
    } catch {
      // silent — the suggestion is optional
    } finally {
      setSqlFixLoading(false)
    }
  }, [])

  const resolveTargetConnection = useCallback((tab: { connectionId?: string }): Connection | null => {
    const connId = tab.connectionId || activeConnection?.id;
    if (!connId) return null;
    return (connections.find(c => c.id === connId) || activeConnection || null) as Connection | null;
  }, [activeConnection, connections])

  const handleRunScript = useCallback(async (statements: string[], raw: string) => {
    const targetConnection = resolveTargetConnection(activeTab)
    if (!targetConnection) {
      updateTabResults(activeTab.id, {
        status: ExecutionStatus.ERROR,
        error: 'No connection selected. Select a connection in the toolbar to execute this query.',
      })
      return
    }
    setScriptPrompt(null)
    setScriptSummary(null)
    setLastScriptSql(statements)
    setScriptLive(statements.map((sql, index) => ({
      index,
      sql,
      phase: 'pending',
      error: null,
      rowsAffected: null,
      rowCount: null,
    })))
    const schema = targetConnection.database || activeConnection?.database;
    updateTabResults(activeTab.id, {
      status: ExecutionStatus.EXECUTING,
      error: null,
      results: null,
    })

    const startTime = Date.now()
    try {
      let report: ScriptReport
      try {
        report = await queryService.runScript(targetConnection.id, statements, schema)
      } catch (err: unknown) {
        const isConnNotFound = err instanceof Error && err.message.includes('not found') && err.message.includes('Connection');
        if (isConnNotFound) {
          await connectionService.reconnect(targetConnection.id);
          report = await queryService.runScript(targetConnection.id, statements, schema);
        } else {
          throw err;
        }
      }

      activeScriptRunIdRef.current = null
      const durationMs = Date.now() - startTime
      setScriptSummary(report)
      // Los statements pendientes (no ejecutados, p. ej. tras cancel) quedan skipped.
      setScriptLive(prev => prev
        ? prev.map(s => s.phase === 'running' || s.phase === 'pending' ? { ...s, phase: 'skipped' as const } : s)
        : prev)
      updateTabResults(activeTab.id, {
        status: report.rolledBack ? ExecutionStatus.ERROR : ExecutionStatus.SUCCESS,
        error: report.rolledBack
          ? `Script cancelled: ${report.ok} ok, ${report.failed} failed, ${report.skipped} skipped — transaction rolled back.`
          : report.failed > 0
            ? `Script completed with errors: ${report.ok} ok, ${report.failed} failed, ${report.skipped} skipped.`
            : null,
        results: null,
      })

      if (report.rolledBack) {
        toast.error(`Script rolled back: ${report.ok} ok, ${report.failed} failed, ${report.skipped} skipped`)
      } else if (report.pendingCommit) {
        toast.success(`Script completed: ${report.ok} ok — changes pending. Press Commit on the bottom bar to apply.`)
      } else if (report.failed > 0) {
        toast(`Script completed: ${report.ok} ok, ${report.failed} failed, ${report.skipped} skipped`, { icon: '⚠️' })
      } else {
        toast.success(`Script completed: ${report.ok} statements in ${durationMs} ms`)
      }

      const histEntry: QueryHistoryEntry = {
        id: Math.random().toString(36).substring(2),
        query: raw,
        connectionId: targetConnection.id,
        executedAt: Date.now(),
        durationMs,
        status: report.failed > 0 || report.rolledBack ? 'error' : 'success',
        rowCount: report.ok,
      };
      addQueryHistory(histEntry);
      schemaService.saveQueryHistory([histEntry]).catch(() => undefined)
      if (!report.rolledBack && report.failed === 0) {
        usePerformanceStore.getState().addRecord({
          id: histEntry.id,
          connectionId: targetConnection.id,
          sql: raw,
          durationMs,
          rowsReturned: report.ok,
          executedAt: Date.now(),
        });
      }
    } catch (error: unknown) {
      activeScriptRunIdRef.current = null
      setScriptPrompt(null)
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;
      updateTabResults(activeTab.id, {
        status: ExecutionStatus.ERROR,
        error: message
      });
      setScriptLive(prev => prev
        ? prev.map(s => s.phase === 'running' || s.phase === 'pending' ? { ...s, phase: 'skipped' as const } : s)
        : prev)
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
    }
  }, [activeTab, activeConnection, resolveTargetConnection, updateTabResults, addQueryHistory])

  const respondScriptPrompt = useCallback(async (decision: ScriptDecision) => {
    if (!scriptPrompt || scriptResponding) return
    setScriptResponding(true)
    try {
      await queryService.respond(scriptPrompt.runId, decision)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to send decision: ${message}`)
    } finally {
      setScriptResponding(false)
      setScriptPrompt(null)
    }
  }, [scriptPrompt, scriptResponding])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    listen<ScriptErrorPrompt>('script:error-prompt', (event) => {
      if (cancelled) return
      const payload = event.payload
      if (typeof payload === 'object' && payload !== null && 'runId' in payload) {
        activeScriptRunIdRef.current = payload.runId ?? null
        setScriptSummary(null)
        setScriptPrompt({
          runId: String(payload.runId),
          index: Number(payload.index ?? 0),
          sql: String(payload.sql ?? ''),
          error: String(payload.error ?? ''),
        })
      }
    }).then((fn) => { unlisten = fn })
    return () => { cancelled = true; unlisten?.() }
  }, [])

  // Estados en vivo de cada statement del script (vista estilo Workbench):
  // running → ok / failed (skipped se decide al terminar).
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    listen<Record<string, unknown>>('script:statement', (event) => {
      if (cancelled) return
      const payload = event.payload
      if (typeof payload !== 'object' || payload === null) return
      const index = Number(payload.index ?? -1)
      const phase = String(payload.phase ?? 'running')
      setScriptLive(prev => {
        if (!prev || index < 0 || index >= prev.length) return prev
        return prev.map((s) => {
          if (s.index !== index) return s
          if (phase === 'ok' || phase === 'failed') {
            return {
              ...s,
              phase: phase as 'ok' | 'failed',
              error: payload.error != null ? String(payload.error) : s.error,
              rowsAffected: payload.rowsAffected != null ? Number(payload.rowsAffected) : s.rowsAffected,
              rowCount: payload.rowCount != null ? Number(payload.rowCount) : s.rowCount,
            }
          }
          return { ...s, phase: 'running' }
        })
      })
    }).then((fn) => { unlisten = fn })
    return () => { cancelled = true; unlisten?.() }
  }, [])

  const handleExecuteAll = useCallback(async (page: number = 1, limit?: number, overrideSql?: string) => {
    const raw = overrideSql?.trim() ?? activeTab?.query
    if (!raw) return
    setSelectedRowIndexes(new Set())
    setSelectionAnchor(null)
    const targetConnectionId = activeTab.connectionId || activeConnection?.id;
    const targetConnection = activeConnection && activeConnection.id === targetConnectionId
      ? activeConnection
      : (connections.find(c => c.id === targetConnectionId) || activeConnection || null);
    if (!targetConnection) {
      setSafeDeleteSuggestion(null)
      setSqlFixSuggestion(null)
      setSqlFixLoading(false)
      updateTabResults(activeTab.id, {
        status: ExecutionStatus.ERROR,
        error: 'No connection selected. Select a connection in the toolbar to execute this query.',
      })
      return
    }
    setSafeDeleteSuggestion(null)
    setSqlFixSuggestion(null)
    const isMongo = targetConnection.type === DatabaseType.MONGODB;
    const isPostgres = targetConnection.type === DatabaseType.POSTGRES;
    if (checkDangerousQuery(raw, isMongo, targetConnection)) return

      const effectiveLimit = limit ?? queryLimit;
      let sql = raw;

      if (isMongo) {
        sql = buildMongoJsonQuery(sql, activeTab.mongoFilter, activeTab.editorMode);
      } else {
        const statements = splitSqlStatements(sql);
        if (statements.length > 1) {
          // Script multi-statement: el backend lo ejecuta en una transacción
          // propia, statement a statement, preguntando qué hacer ante errores.
          void handleRunScript(statements, raw);
          return;
        }
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
        // For PostgreSQL the schema (search_path) scopes unqualified table names, so prefer
        // the selected schema over the connection's database name.
        const schema = isPostgres
          ? (activeConnection?.database || targetConnection.defaultDatabase || targetConnection.database)
          : (targetConnection.database || activeConnection?.database);
        
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

        // Track open transaction state (BEGIN / COMMIT / ROLLBACK)
        if (!isMongo) {
          const trimmedSql = sql.trim().replace(/;$/, '').trim()
          const isBegin = /^(BEGIN|START\s+TRANSACTION)$/i.test(trimmedSql)
          const isEnd = /^(COMMIT|ROLLBACK|ROLLBACK\s+TO\s+\S+)$/i.test(trimmedSql)
          if (isBegin) {
            setOpenTransaction({ connectionId: targetConnection.id, startedAt: Date.now() })
          } else if (isEnd) {
            setOpenTransaction(null)
          }
        }

        // Refresh table metadata when the query changed the schema (e.g. ALTER TABLE ... ADD COLUMN)
        if (!isMongo && isSchemaChangingQuery(sql)) {
          refreshSchemaMetadata(targetConnection.id);
        }

        // Handle MongoDB use <db> — update connection's active database
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
                extractWhereClauseFromDelete(raw) ?? undefined,
              )
              setSafeDeleteSuggestion(safeSql)
            } catch {
              // silent — suggestion is optional
            }
          }
        }

        // Auto-detect SQL syntax errors and ask the assistant for a corrected query
        if (isSqlSyntaxError(message) && targetConnection) {
          fetchSqlFix(targetConnection.id, sql, message)
        }
      }
  }, [activeTab, activeConnection, connections, updateTabResults, checkDangerousQuery, queryLimit, addQueryHistory, addXP, isQueryFirstTime, markQueryExecuted, trackAction, setActiveConnectionDatabase, refreshSchemaMetadata, fetchSqlFix, handleRunScript])

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
    setSqlFixSuggestion(null)
    setSqlFixLoading(false)

    const fullText = view.state.doc.toString()
    const mainSel = view.state.selection.main
    const cursorPos = mainSel.head
    let sqlSnippet: string

    if (!mainSel.empty) {
      sqlSnippet = view.state.sliceDoc(mainSel.from, mainSel.to)
    } else {
      // Execute the statement at the cursor: the text bounded by the previous ';'
      // (or start of file) and the next ';' at/after the cursor (or end of file),
      // falling back to the preceding statement when the cursor sits on blank space.
      sqlSnippet = extractStatementAtCursor(fullText, cursorPos)
    }

    if (!sqlSnippet) return
    setSelectedRowIndexes(new Set())
    setSelectionAnchor(null)

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

      // Track open transaction state (BEGIN / COMMIT / ROLLBACK)
      if (!isMongo) {
        const trimmedSnippet = sqlSnippet.trim().replace(/;$/, '').trim()
        const isBegin = /^(BEGIN|START\s+TRANSACTION)$/i.test(trimmedSnippet)
        const isEnd = /^(COMMIT|ROLLBACK|ROLLBACK\s+TO\s+\S+)$/i.test(trimmedSnippet)
        if (isBegin) {
          setOpenTransaction({ connectionId: targetConnection.id, startedAt: Date.now() })
        } else if (isEnd) {
          setOpenTransaction(null)
        }
      }

      // Refresh table metadata when the query changed the schema (e.g. ALTER TABLE ... ADD COLUMN)
      if (!isMongo && isSchemaChangingQuery(sqlSnippet)) {
        refreshSchemaMetadata(targetConnection.id);
      }

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
              extractWhereClauseFromDelete(sqlSnippet) ?? undefined,
            )
            setSafeDeleteSuggestion(safeSql)
          } catch {
            // silent — suggestion is optional
          }
        }
      }

      // Auto-detect SQL syntax errors and ask the assistant for a corrected query
      if (isSqlSyntaxError(message) && targetConnection) {
        fetchSqlFix(targetConnection.id, sqlSnippet, message)
      }
    }
  }, [activeTab, activeConnection, connections, updateTabResults, checkDangerousQuery, queryLimit, addXP, isQueryFirstTime, markQueryExecuted, trackAction, setActiveConnectionDatabase, refreshSchemaMetadata, fetchSqlFix])

  // Use refs to avoid stale closures in editor keybindings
  const executeCurrentRef = useRef(handleExecuteCurrent)
  const executeAllRef = useRef(handleExecuteAll)
  
  useEffect(() => {
    executeCurrentRef.current = handleExecuteCurrent
    executeAllRef.current = handleExecuteAll
  }, [handleExecuteCurrent, handleExecuteAll])

  const handleCancel = useCallback(() => {
    // Si hay un script en curso, cancelarlo produce rollback real.
    const runningRunId = activeScriptRunIdRef.current;
    if (runningRunId) {
      queryService.cancelScript(runningRunId).catch(() => undefined)
      setScriptPrompt(null)
    }
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
    const tableName = tableNameMatch ? tableNameMatch[1] : null

    if (!tableName) {
      updateTabResults(activeTab.id, { 
        status: ExecutionStatus.ERROR, 
        error: 'Cannot update: Table name not found in query.' 
      })
      setEditingCell(null)
      return
    }

    // Strip external quotes from tableName if regex captured them
    const cleanTableName = tableName.replace(/^[`"[]+|[`"\]]+$/g, '')

    const pkValues = pkColumns.map((pk: string) => row[pk])

    if (pkValues.some((v: DbValue) => v === null || v === undefined)) {
       updateTabResults(activeTab.id, { 
        status: ExecutionStatus.ERROR, 
        error: 'Cannot update: Primary key value is null or undefined.' 
      })
      setEditingCell(null)
      return
    }

    const finalSql = generateUpdateByIds(
      cleanTableName,
      [row],
      pkColumns,
      [{ column, value: newValue }],
      targetConnection.type,
    )

    if (!finalSql) {
      updateTabResults(activeTab.id, { 
        status: ExecutionStatus.ERROR, 
        error: 'Cannot update: Failed to generate UPDATE statement for this record.' 
      })
      setEditingCell(null)
      return
    }

    const updatedRows = [...activeTab.results.rows]
    updatedRows[rowIndex] = { ...updatedRows[rowIndex], [column]: newValue }
    
    updateTabResults(activeTab.id, { 
      results: { ...activeTab.results, rows: updatedRows },
      status: ExecutionStatus.EXECUTING,
      error: null
    })

    try {
        const isPostgres = targetConnection.type === DatabaseType.POSTGRES;
        const schema = isPostgres
          ? (activeConnection?.database || targetConnection.defaultDatabase || targetConnection.database)
          : (targetConnection.database || activeConnection?.database);

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
    const row = activeTab?.results?.rows[editingCell.rowIndex]
    const prevValue = row ? row[editingCell.column] : null
    const nextValue = coerceEditedDateValue(String(editingCell.value ?? ''), prevValue)
    // When the Review Change panel is disabled (Settings â†’ Query Editor â†’
    // Inline edition), apply the edit immediately.
    if (!useAppStore.getState().inlineEditReview) {
      await updateCell(editingCell.rowIndex, editingCell.column, nextValue)
      return
    }
    // Stage the edit so the user can review the diff before committing.
    setPendingEdit({
      rowIndex: editingCell.rowIndex,
      column: editingCell.column,
      prevValue,
      nextValue,
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

  const handleGenerateSql = useCallback(async (action: string) => {
    if (!contextMenuSql || !activeTab?.results) return;

    const targetConnectionId = activeTab.connectionId || activeConnection?.id;
    const targetConnection = activeConnection && activeConnection.id === targetConnectionId
      ? activeConnection
      : (connections.find(c => c.id === targetConnectionId) || activeConnection || null);
    if (!targetConnection) return;

    const isMongo = targetConnection.type === DatabaseType.MONGODB;

    // Reutiliza la selección múltiple del resultsPanel: si hay filas
    // seleccionadas se generan consultas para todas; si no, para la fila
    // sobre la que se hizo click derecho.
    const selectedRows = [...selectedRowIndexes]
      .map((i) => sortedRows[i])
      .filter((r): r is DbRow => Boolean(r))
    const rows = selectedRows.length > 0 ? selectedRows : [contextMenuSql.row]

    try {
      if (action === 'json') {
        const jsonStr = JSON.stringify(rows.length > 1 ? rows : rows[0], null, 2);
        setSqlModal({ isOpen: true, sql: jsonStr });
      } else if (isMongo) {
        const collection = extractMongoCollection(activeTab.query)
        if (!collection) {
          updateTabResults(activeTab.id, {
            status: ExecutionStatus.ERROR,
            error: 'Cannot generate Mongo command: Collection name not found in query.',
          })
          setContextMenuSql(null)
          return
        }
        const mongoSql = generateMongoCommand(collection, action as MongoAction, rows)
        setSqlModal({ isOpen: true, sql: mongoSql });
      } else {
        const tableNameMatch = activeTab.query.match(TABLE_NAME_REGEX)
        const tableName = tableNameMatch ? tableNameMatch[1] : null

        if (!tableName) {
          updateTabResults(activeTab.id, {
            status: ExecutionStatus.ERROR,
            error: 'Cannot generate SQL: Table name not found in query.',
          })
          setContextMenuSql(null)
          return
        }

        const pks = activeTab.results.primary_keys || [];

        // Reutiliza los generadores del DataTab (sqlGenerator.ts): soportan
        // una o varias filas. UPDATE usa los valores no-PK del primer registro.
        let sql = ''
        switch (action) {
          case 'select':
            sql = generateSelectByIds(tableName, rows, pks, targetConnection.type)
            break
          case 'delete':
            sql = generateDeleteByIds(tableName, rows, pks, targetConnection.type)
            break
          case 'insert':
            sql = generateInsertRows(tableName, rows, targetConnection.type)
            break
          case 'update': {
            const assignments = Object.entries(rows[0] ?? {})
              .filter(([k]) => !pks.includes(k))
              .map(([k, v]) => ({ column: k, value: v as DbValue }))
            sql = generateUpdateByIds(tableName, rows, pks, assignments, targetConnection.type)
            break
          }
          default:
            sql = ''
        }
        if (!sql) {
          updateTabResults(activeTab.id, {
            status: ExecutionStatus.ERROR,
            error: 'Cannot generate SQL: No primary key / identity columns available to identify the selected rows.',
          })
          setContextMenuSql(null)
          return
        }
        setSqlModal({ isOpen: true, sql });
      }
    } catch (e) {
      console.error('Failed to generate SQL:', e);
    } finally {
      setContextMenuSql(null);
    }
  }, [contextMenuSql, activeConnection, connections, activeTab, updateTabResults, selectedRowIndexes, sortedRows]);

  /** Copy the right-clicked row (or all selected rows) to the clipboard as JSON. */
  const handleCopyRows = useCallback(async () => {
    if (!contextMenuSql || !activeTab?.results) return;

    const selectedRows = [...selectedRowIndexes]
      .map((i) => sortedRows[i])
      .filter((r): r is DbRow => Boolean(r))
    const rows = selectedRows.length > 0 ? selectedRows : [contextMenuSql.row]

    try {
      const text = rows.length > 1 ? JSON.stringify(rows, null, 2) : JSON.stringify(rows[0], null, 2)
      await navigator.clipboard.writeText(text)
      toast.success(rows.length > 1 ? `Copied ${rows.length} rows as JSON` : 'Copied row as JSON')
    } catch (e) {
      console.error('Failed to copy rows:', e)
    } finally {
      setContextMenuSql(null)
    }
  }, [contextMenuSql, activeTab, selectedRowIndexes, sortedRows])

  /** Copy a single cell value to the clipboard. */
  const handleCopyCell = useCallback(async (row: DbRow, column: string) => {
    try {
      const value = row[column]
      const text = value === null || value === undefined
        ? ''
        : typeof value === 'object' ? JSON.stringify(value) : String(value)
      await navigator.clipboard.writeText(text)
      toast.success(`Copied ${column}`)
    } catch (e) {
      console.error('Failed to copy cell:', e)
    }
  }, [])

  /** Execute a SELECT that targets the right-clicked row (plus any multi-selected rows). */
  const handleExecuteRowSql = useCallback(async () => {
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
        error: 'Cannot execute: Table name not found in query.',
      })
      setContextMenuSql(null)
      return
    }

    if (tableName.startsWith('`') || tableName.startsWith('"') || tableName.startsWith('[')) {
      tableName = tableName.slice(1, -1)
    }

    const selectedRows = [...selectedRowIndexes]
      .map((i) => sortedRows[i])
      .filter((r): r is DbRow => Boolean(r))
    const rows = selectedRows.length > 0 ? selectedRows : [contextMenuSql.row]

    const where = generateRowsWhereClause(rows, activeTab.results.primary_keys ?? [], targetConnection.type)
    if (!where) {
      updateTabResults(activeTab.id, {
        status: ExecutionStatus.ERROR,
        error: 'Cannot execute: No primary key / identity columns available to identify the selected rows.',
      })
      setContextMenuSql(null)
      return
    }

    const quotedTable = tableName.includes('.')
      ? tableName.split('.').map((part) => quoteIdent(part, targetConnection.type)).join('.')
      : quoteTableName(tableName, targetConnection.type)
    const sql = `SELECT * FROM ${quotedTable} WHERE ${where};`

    setContextMenuSql(null)
    await handleExecuteAll(1, undefined, sql)
  }, [contextMenuSql, activeTab, activeConnection, connections, selectedRowIndexes, sortedRows, handleExecuteAll, updateTabResults])

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

  const handleCommit = useCallback(() => {
    handleExecuteAll(1, undefined, 'COMMIT;')
  }, [handleExecuteAll])

  const handleRollback = useCallback(() => {
    handleExecuteAll(1, undefined, 'ROLLBACK;')
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
    selectedRowIndexes,
    setSelectedRowIndexes,
    selectionAnchor,
    setSelectionAnchor,
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
    handleCopyRows,
    handleCopyCell,
    handleExecuteRowSql,
    updateTabViewState,
    updateTabMongoFilter,
    updateTabEditorMode,
    queryLimit,
    setQueryLimit,
    queryHistory,
    clearQueryHistory,
    safeDeleteSuggestion,
    setSafeDeleteSuggestion,
    sqlFixSuggestion,
    setSqlFixSuggestion,
    sqlFixLoading,
    scriptPrompt,
    setScriptPrompt,
    scriptSummary,
    setScriptSummary,
    scriptResponding,
    respondScriptPrompt,
    scriptLive,
    lastScriptSql,
    openTransaction,
    handleCommit,
    handleRollback,
  }
}
