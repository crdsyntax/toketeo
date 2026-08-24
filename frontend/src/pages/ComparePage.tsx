import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import {
  GitCompare,
  Database,
  FileSpreadsheet,
  Code2,
  Loader2,
  AlertCircle,
  Pause,
  Play,
  Square,
  Plug,
  Search,
  CheckSquare,
  Square as SquareIcon,
  Maximize2,
  Wifi,
  Trash2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { connectionService } from '@/services/connection.service';
import { schemaService } from '@/services/schema.service';
import { useAppStore } from '@/store/useAppStore';
import { useCompareStore } from '@/store/compareStore';
import { SchemaDiffTree } from '@/components/compare/SchemaDiffTree';
import { DataDiffView } from '@/components/compare/DataDiffTable';
import { ScriptPreview } from '@/components/compare/ScriptPreview';
import { FullscreenModal } from '@/components/compare/FullscreenModal';
import { SchemaDiffWizard } from '@/components/compare/SchemaDiffWizard';
import { cn } from '@/lib/utils';
import { DatabaseType, type Connection } from '@/types/database';

type CompareTab = 'schema' | 'data' | 'script';

function isPostgres(type?: string) {
  return type === DatabaseType.POSTGRES || type === DatabaseType.POSTGRES;
}

function usesSchemas(type?: string) {
  return (
    type === DatabaseType.POSTGRES ||
    type === DatabaseType.SQLSERVER ||
    type === DatabaseType.POSTGRES ||
    type === DatabaseType.SQLSERVER
  );
}

function usesDatabases(type?: string) {
  return (
    type === DatabaseType.MYSQL ||
    type === DatabaseType.MARIADB ||
    type === DatabaseType.MONGODB ||
    type === DatabaseType.MYSQL ||
    type === DatabaseType.MARIADB ||
    type === DatabaseType.MONGODB
  );
}

export function ComparePage() {
  const {
    sourceConnId, targetConnId,
    sourceDatabase, targetDatabase,
    sourceSchema, targetSchema,
    selectedTables, activeTab,
    schemaReport, dataReport, syncScript, scriptOptions,
    loading, error, status, progress, compareId,
    setSourceConnId, setTargetConnId,
    setSourceDatabase, setTargetDatabase,
    setSourceSchema, setTargetSchema,
    setSelectedTables, setActiveTab,
    compareSchemas, compareData, generateScript,
    pause, resume, cancel,
    setProgress, toggleStatement, toggleAllStatements, setScriptOptions, toggleStatementPreserve,
    loadLatestSession, clear,
  } = useCompareStore();

  const [tableFilter, setTableFilter] = useState('');
  const [fullscreenTab, setFullscreenTab] = useState<CompareTab | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const queryClient = useQueryClient();

  const connectedConnectionIds = useAppStore((state) => state.connectedConnectionIds);

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getAll(),
  });

  const sourceConn = (connections ?? []).find((c: Connection) => c.id === sourceConnId);
  const targetConn = (connections ?? []).find((c: Connection) => c.id === targetConnId);

  useEffect(() => { loadLatestSession(); }, [loadLatestSession]);

  const autoConnect = useCallback(async (connId: string) => {
    if (!connId || connectedConnectionIds.includes(connId)) return;
    const conn = (connections ?? []).find((c: Connection) => c.id === connId);
    if (!conn) return;
    try {
      await connectionService.connect(conn);
      const { setConnectedConnection } = useAppStore.getState();
      setConnectedConnection(connId);
    } catch (e) {
      console.error(`[compare] auto-connect failed:`, e);
    }
  }, [connections, connectedConnectionIds]);

  useEffect(() => { if (sourceConnId) autoConnect(sourceConnId); }, [sourceConnId, autoConnect]);
  useEffect(() => { if (targetConnId) autoConnect(targetConnId); }, [targetConnId, autoConnect]);

  const { data: sourceDatabases, isLoading: loadingSourceDbs } = useQuery({
    queryKey: ['compare-databases', sourceConnId],
    queryFn: () => schemaService.getDatabases(sourceConnId),
    enabled: !!sourceConnId && connectedConnectionIds.includes(sourceConnId) && (usesDatabases(sourceConn?.type) || isPostgres(sourceConn?.type)),
  });

  const { data: targetDatabases, isLoading: loadingTargetDbs } = useQuery({
    queryKey: ['compare-databases', targetConnId],
    queryFn: () => schemaService.getDatabases(targetConnId),
    enabled: !!targetConnId && connectedConnectionIds.includes(targetConnId) && (usesDatabases(targetConn?.type) || isPostgres(targetConn?.type)),
  });

  const sourceSchemasEnabled =
    !!sourceConnId &&
    connectedConnectionIds.includes(sourceConnId) &&
    (usesSchemas(sourceConn?.type)
      ? isPostgres(sourceConn?.type)
        ? !!sourceDatabase
        : true
      : false);

  const targetSchemasEnabled =
    !!targetConnId &&
    connectedConnectionIds.includes(targetConnId) &&
    (usesSchemas(targetConn?.type)
      ? isPostgres(targetConn?.type)
        ? !!targetDatabase
        : true
      : false);

  const { data: sourceSchemas, isLoading: loadingSourceSchemas } = useQuery({
    queryKey: ['compare-schemas', sourceConnId, sourceDatabase],
    queryFn: async () => {
      if (isPostgres(sourceConn?.type) && sourceDatabase) {
        await schemaService.switchDatabase(sourceConnId, sourceDatabase);
      }
      return schemaService.getSchemas(sourceConnId);
    },
    enabled: sourceSchemasEnabled,
  });

  const { data: targetSchemas, isLoading: loadingTargetSchemas } = useQuery({
    queryKey: ['compare-schemas', targetConnId, targetDatabase],
    queryFn: async () => {
      if (isPostgres(targetConn?.type) && targetDatabase) {
        await schemaService.switchDatabase(targetConnId, targetDatabase);
      }
      return schemaService.getSchemas(targetConnId);
    },
    enabled: targetSchemasEnabled,
  });

  const sourceContext = usesSchemas(sourceConn?.type)
    ? sourceSchema
    : usesDatabases(sourceConn?.type)
      ? sourceDatabase || sourceConn?.database || undefined
      : undefined;

  const targetContext = usesSchemas(targetConn?.type)
    ? targetSchema
    : usesDatabases(targetConn?.type)
      ? targetDatabase || targetConn?.database || undefined
      : undefined;

  const tablesReady =
    !!sourceConn &&
    !!targetConn &&
    connectedConnectionIds.includes(sourceConnId) &&
    connectedConnectionIds.includes(targetConnId) &&
    (usesDatabases(sourceConn.type) ? !!sourceDatabase || !!sourceConn.database : true) &&
    (usesDatabases(targetConn.type) ? !!targetDatabase || !!targetConn.database : true) &&
    (usesSchemas(sourceConn.type) ? !!sourceSchema : true) &&
    (usesSchemas(targetConn.type) ? !!targetSchema : true);

  const { data: sourceTables = [], isLoading: loadingSourceTables } = useQuery({
    queryKey: ['compare-tables-source', sourceConnId, sourceContext],
    queryFn: async () => {
      if (usesDatabases(sourceConn?.type) && sourceDatabase) {
        await schemaService.switchDatabase(sourceConnId, sourceDatabase);
      }
      const tables = await schemaService.getTables(sourceConnId, sourceContext);
      return tables.map((t) => t.name);
    },
    enabled: tablesReady,
  });

  const { data: targetTables = [], isLoading: loadingTargetTables } = useQuery({
    queryKey: ['compare-tables-target', targetConnId, targetContext],
    queryFn: async () => {
      if (usesDatabases(targetConn?.type) && targetDatabase) {
        await schemaService.switchDatabase(targetConnId, targetDatabase);
      }
      const tables = await schemaService.getTables(targetConnId, targetContext);
      return tables.map((t) => t.name);
    },
    enabled: tablesReady,
  });

  const targetTableSet = useMemo(
    () => new Set(targetTables.map((t) => t.toLowerCase())),
    [targetTables]
  );

  const missingOnTarget = useMemo(
    () => selectedTables.filter((t) => !targetTableSet.has(t.toLowerCase())),
    [selectedTables, targetTableSet]
  );

  const filteredSourceTables = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    if (!q) return sourceTables;
    return sourceTables.filter((t) => t.toLowerCase().includes(q));
  }, [sourceTables, tableFilter]);

  useEffect(() => {
    if (sourceDatabases?.length && !sourceDatabase) setSourceDatabase(sourceDatabases[0]);
  }, [sourceDatabases, sourceDatabase, setSourceDatabase]);

  useEffect(() => {
    if (targetDatabases?.length && !targetDatabase) setTargetDatabase(targetDatabases[0]);
  }, [targetDatabases, targetDatabase, setTargetDatabase]);

  useEffect(() => {
    if (sourceSchemas?.length && !sourceSchema) setSourceSchema(sourceSchemas[0]);
  }, [sourceSchemas, sourceSchema, setSourceSchema]);

  useEffect(() => {
    if (targetSchemas?.length && !targetSchema) setTargetSchema(targetSchemas[0]);
  }, [targetSchemas, targetSchema, setTargetSchema]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ compare_id: string; message: string; current: number; total: number }>(
      'compare:progress',
      (event) => {
        if (!compareId || event.payload.compare_id !== compareId) return;
        setProgress({
          message: event.payload.message,
          current: event.payload.current,
          total: event.payload.total,
        });
      }
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [compareId, setProgress]);

  const handleCompareSchema = () => {
    if (!sourceConnId || !targetConnId) return;
    if (selectedTables.length === 0) return;
    setActiveTab('schema');
    compareSchemas({
      sourceConnId,
      targetConnId,
      sourceSchema: sourceContext || undefined,
      targetSchema: targetContext || undefined,
      tables: selectedTables,
    });
  };

  const handleCompareData = () => {
    if (!sourceConnId || !targetConnId) return;
    const tablesForData = selectedTables.filter((t) => targetTableSet.has(t.toLowerCase()));
    if (tablesForData.length === 0) return;
    setActiveTab('data');
    compareData({
      sourceConnId,
      targetConnId,
      sourceSchema: sourceContext || undefined,
      targetSchema: targetContext || undefined,
      tables: tablesForData,
    });
  };

  const handleGenerateScript = () => {
    if (!schemaReport) return;
    setActiveTab('script');
    generateScript(targetConn?.type || 'mysql');
  };

  const toggleTable = (name: string) => {
    setSelectedTables(
      selectedTables.includes(name)
        ? selectedTables.filter((t) => t !== name)
        : [...selectedTables, name]
    );
  };

  const selectAllFiltered = () => {
    const allSelected = filteredSourceTables.length > 0 && filteredSourceTables.every((t) => selectedTables.includes(t));
    if (allSelected) {
      setSelectedTables([]);
    } else {
      const set = new Set(selectedTables);
      filteredSourceTables.forEach((t) => set.add(t));
      setSelectedTables(Array.from(set));
    }
  };

  const deselectAll = () => setSelectedTables([]);

  const rescanTables = () => {
    queryClient.invalidateQueries({ queryKey: ['compare-tables-source'] });
    queryClient.invalidateQueries({ queryKey: ['compare-tables-target'] });
  };

  const isRunning = status === 'running' || status === 'paused';
  const canStart = !!sourceConnId && !!targetConnId && selectedTables.length > 0 && !isRunning;
  const sourceConnecting = !!sourceConnId && !connectedConnectionIds.includes(sourceConnId);
  const targetConnecting = !!targetConnId && !connectedConnectionIds.includes(targetConnId);

  if (!connections || connections.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
          <Plug className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1">No active connections</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            To compare databases you need at least one open connection.
            Open or create a connection from the sidebar or the connections page.
          </p>
        </div>
        <Link
          to="/"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium"
        >
          <Database className="w-4 h-4" />
          Go to Connections
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center gap-3 shrink-0">
        <GitCompare className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-semibold">Database Compare</h1>
        {(sourceConnecting || targetConnecting) && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting...
          </div>
        )}
        {isRunning && (
          <div className="ml-auto flex items-center gap-2">
            {status === 'running' && (
              <button
                onClick={() => pause()}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg hover:bg-muted text-xs font-medium"
              >
                <Pause className="w-3.5 h-3.5" /> Pause
              </button>
            )}
            {status === 'paused' && (
              <button
                onClick={() => resume()}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg hover:bg-muted text-xs font-medium"
              >
                <Play className="w-3.5 h-3.5" /> Resume
              </button>
            )}
            <button
              onClick={() => cancel()}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-destructive/40 text-destructive rounded-lg hover:bg-destructive/10 text-xs font-medium"
            >
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          </div>
        )}
      </div>

      {isRunning && progress && (
        <div className="shrink-0 border border-border rounded-lg px-4 py-2 bg-muted/20">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="flex items-center gap-1.5">
              {status === 'paused' ? (
                <Pause className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              )}
              {status === 'paused' ? 'Paused — ' : ''}
              {progress.message}
            </span>
            {progress.total > 0 && (
              <span className="text-muted-foreground">
                {progress.current}/{progress.total}
              </span>
            )}
          </div>
          {progress.total > 0 && (
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  status === 'paused' ? 'bg-amber-500' : 'bg-primary'
                )}
                style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {sourceConnecting || targetConnecting ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-500/5 text-xs text-blue-700 dark:text-blue-400 shrink-0">
          <Wifi className="w-4 h-4 animate-pulse" />
          <span>
            Connecting {sourceConnecting ? 'source' : 'target'}...
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 shrink-0">
        <ConnectionSide
          label="Source"
          connId={sourceConnId}
          onConnChange={setSourceConnId}
          connections={connections ?? []}
          conn={sourceConn}
          database={sourceDatabase}
          onDatabaseChange={setSourceDatabase}
          schema={sourceSchema}
          onSchemaChange={setSourceSchema}
          databases={sourceDatabases}
          schemas={sourceSchemas}
          loadingDbs={loadingSourceDbs}
          loadingSchemas={loadingSourceSchemas}
          disabled={isRunning}
        />
        <ConnectionSide
          label="Target"
          connId={targetConnId}
          onConnChange={setTargetConnId}
          connections={connections ?? []}
          conn={targetConn}
          database={targetDatabase}
          onDatabaseChange={setTargetDatabase}
          schema={targetSchema}
          onSchemaChange={setTargetSchema}
          databases={targetDatabases}
          schemas={targetSchemas}
          loadingDbs={loadingTargetDbs}
          loadingSchemas={loadingTargetSchemas}
          disabled={isRunning}
        />
      </div>

      {tablesReady && (
        <div className="border border-border rounded-lg shrink-0 max-h-48 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
            <span className="text-xs font-medium">Tables to compare</span>
            <span className="text-xs text-muted-foreground">
              ({selectedTables.length} selected / {sourceTables.length})
            </span>
            <div className="ml-auto flex items-center gap-1">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  placeholder="Filter..."
                  disabled={isRunning}
                  className="h-7 pl-7 pr-2 w-36 rounded border border-border bg-background text-xs"
                />
              </div>
              <button
                onClick={selectAllFiltered}
                disabled={isRunning || filteredSourceTables.length === 0}
                className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-muted rounded disabled:opacity-50"
              >
                <CheckSquare className="w-3.5 h-3.5" /> All
              </button>
              <button
                onClick={deselectAll}
                disabled={isRunning || selectedTables.length === 0}
                className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-muted rounded disabled:opacity-50"
              >
                <SquareIcon className="w-3.5 h-3.5" /> None
              </button>
              <button
                onClick={rescanTables}
                disabled={isRunning || loadingSourceTables || loadingTargetTables}
                className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-muted rounded disabled:opacity-50"
                title="Rescan tables"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', (loadingSourceTables || loadingTargetTables) && 'animate-spin')} />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
            {loadingSourceTables || loadingTargetTables ? (
              <div className="col-span-full flex items-center justify-center py-4 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading tables...
              </div>
            ) : filteredSourceTables.length === 0 ? (
              <div className="col-span-full text-center py-4 text-xs text-muted-foreground">
                No tables in source
              </div>
            ) : (
              filteredSourceTables.map((name) => {
                const missing = !targetTableSet.has(name.toLowerCase());
                const checked = selectedTables.includes(name);
                return (
                  <label
                    key={name}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer hover:bg-muted/50',
                      missing && 'text-amber-600',
                      checked && 'bg-primary/5'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isRunning}
                      onChange={() => toggleTable(name)}
                      className="rounded border-border"
                    />
                    <span className="font-mono truncate" title={name}>
                      {name}
                    </span>
                    {missing && (
                      <span className="ml-auto text-[var(--ch-text-10)] text-amber-600 shrink-0" title="Does not exist in target">
                        !
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}

      {missingOnTarget.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-700 dark:text-amber-400 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">
              {missingOnTarget.length} table{missingOnTarget.length !== 1 ? 's' : ''} missing in target
            </p>
            <p className="text-amber-600/80 mt-0.5">
              {missingOnTarget.slice(0, 8).join(', ')}
              {missingOnTarget.length > 8 ? ` and ${missingOnTarget.length - 8} more` : ''}
              . Will be marked as <strong>Missing</strong> in schema compare.
              Will not be included in data compare.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <button
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 transition-all text-sm font-medium shadow-sm"
          title="Schema Diff Wizard — find missing objects and generate migration SQL"
        >
          <Sparkles className="w-4 h-4" />
          Diff Wizard
        </button>
        <button
          onClick={handleCompareSchema}
          disabled={!canStart}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {loading && activeTab === 'schema' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Database className="w-4 h-4" />
          )}
          Compare Schema
        </button>
        <button
          onClick={handleCompareData}
          disabled={!canStart || missingOnTarget.length === selectedTables.length}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {loading && activeTab === 'data' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="w-4 h-4" />
          )}
          Compare Data
        </button>
        <button
          onClick={handleGenerateScript}
          disabled={loading || !schemaReport || isRunning}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {loading && activeTab === 'script' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Code2 className="w-4 h-4" />
          )}
          Generate Script
        </button>
        {(schemaReport || dataReport || syncScript || selectedTables.length > 0) && (
          <button
            onClick={clear}
            disabled={isRunning}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-muted hover:text-destructive disabled:opacity-50 transition-colors text-sm font-medium"
            title="Clear current comparison"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        {error && (
          <div className="flex items-center gap-1.5 text-xs text-destructive ml-auto max-w-md truncate">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}
        {status === 'cancelled' && !error && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
            Comparison stopped by user
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-border shrink-0">
        {(['schema', 'data', 'script'] as CompareTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'schema' && 'Schema Diff'}
            {tab === 'data' && 'Data Diff'}
            {tab === 'script' && 'Sync Script'}
          </button>
        ))}
        {activeTab !== 'script' && (activeTab === 'schema' ? schemaReport : dataReport) && (
          <button
            onClick={() => setFullscreenTab(activeTab)}
            className="ml-auto flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            title="Open in fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        {loading && !progress && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && activeTab === 'schema' && schemaReport && (
          <SchemaDiffTree report={schemaReport} />
        )}

        {!loading && activeTab === 'data' && dataReport && (
          <DataDiffView report={dataReport} />
        )}

        {!loading && activeTab === 'script' && syncScript && (
          <ScriptPreview
            script={syncScript}
            options={scriptOptions}
            onToggleStatement={toggleStatement}
            onToggleAll={toggleAllStatements}
            onOptionsChange={setScriptOptions}
            onToggleStatementPreserve={toggleStatementPreserve}
            sourceName={schemaReport?.source_name}
            targetName={schemaReport?.target_name}
            targetDatabase={targetDatabase || targetConn?.database}
            targetType={targetConn?.type}
          />
        )}

        {!loading && activeTab === 'schema' && !schemaReport && (
          <EmptyHint
            icon={<GitCompare className="w-8 h-8 mb-2 opacity-50" />}
            text={
              !sourceConnId || !targetConnId
                ? 'Select source and target'
                : selectedTables.length === 0
                  ? 'Select at least one table to compare'
                  : 'Click on "Compare Schema"'
            }
          />
        )}

        {!loading && activeTab === 'data' && !dataReport && (
          <EmptyHint
            icon={<FileSpreadsheet className="w-8 h-8 mb-2 opacity-50" />}
            text="Select tables that exist on both sides and click Compare Data"
          />
        )}

        {!loading && activeTab === 'script' && !syncScript && (
          <EmptyHint
            icon={<Code2 className="w-8 h-8 mb-2 opacity-50" />}
            text='Run Schema Compare first, then "Generate Script"'
          />
        )}
      </div>

      <FullscreenModal
        open={fullscreenTab !== null}
        title={fullscreenTab === 'schema' ? 'Schema Diff — Fullscreen' : 'Data Diff — Fullscreen'}
        onClose={() => setFullscreenTab(null)}
      >
        {fullscreenTab === 'schema' && schemaReport && <SchemaDiffTree report={schemaReport} />}
        {fullscreenTab === 'data' && dataReport && <DataDiffView report={dataReport} />}
      </FullscreenModal>

      <SchemaDiffWizard open={wizardOpen} onClose={() => setWizardOpen(false)} connections={connections ?? []} />
    </div>
  );
}

function EmptyHint({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  );
}

interface ConnectionSideProps {
  label: string;
  connId: string;
  onConnChange: (id: string) => void;
  connections: Connection[];
  conn?: Connection;
  database: string;
  onDatabaseChange: (v: string) => void;
  schema: string;
  onSchemaChange: (v: string) => void;
  databases?: string[];
  schemas?: string[];
  loadingDbs: boolean;
  loadingSchemas: boolean;
  disabled?: boolean;
}

function ConnectionSide({
  label,
  connId,
  onConnChange,
  connections,
  conn,
  database,
  onDatabaseChange,
  schema,
  onSchemaChange,
  databases,
  schemas,
  loadingDbs,
  loadingSchemas,
  disabled,
}: ConnectionSideProps) {
  const showDb = usesDatabases(conn?.type) || isPostgres(conn?.type);
  const showSchema = usesSchemas(conn?.type);

  return (
    <div className="space-y-2 border border-border rounded-lg p-3">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      <select
        value={connId}
        onChange={(e) => onConnChange(e.target.value)}
        disabled={disabled}
        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm disabled:opacity-50"
      >
        <option value="">Select connection...</option>
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.type})
          </option>
        ))}
      </select>

      {showDb && (
        <div className="space-y-1">
          <span className="text-[var(--ch-text-10)] text-muted-foreground uppercase">
            {isPostgres(conn?.type) ? 'Database' : 'Database / Schema'}
          </span>
          {loadingDbs ? (
            <div className="h-9 flex items-center px-3 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Loading...
            </div>
          ) : (
            <select
              value={database}
              onChange={(e) => onDatabaseChange(e.target.value)}
              disabled={disabled || !connId}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm disabled:opacity-50"
            >
              <option value="">Seleccionar database...</option>
              {(databases ?? []).map((db) => (
                <option key={db} value={db}>
                  {db}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {showSchema && (
        <div className="space-y-1">
          <span className="text-[var(--ch-text-10)] text-muted-foreground uppercase">Schema</span>
          {loadingSchemas ? (
            <div className="h-9 flex items-center px-3 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Loading schemas...
            </div>
          ) : (
            <select
              value={schema}
              onChange={(e) => onSchemaChange(e.target.value)}
              disabled={disabled || !connId || (isPostgres(conn?.type) && !database)}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm disabled:opacity-50"
            >
              <option value="">Seleccionar schema...</option>
              {(schemas ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
