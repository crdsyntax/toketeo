import {
  Loader2,
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  ChevronUp,
  Zap,
  Terminal,
  Copy,
  Check,
} from 'lucide-react';
import { useState, useRef } from 'react';
import type {
  QueryResult,
  DatabaseObject,
  DbValue,
  Connection,
} from '@/types/database';
import { ExecutionStatus, Environment } from '@/types/database';
import { useAppStore } from '@/store/useAppStore';
import { formatCellValue } from '@/lib/formatCellValue';

interface RedisDataTabProps {
  selectedItem: DatabaseObject;
  connection?: Connection | null;
  isLoading: boolean;
  executionStatus: ExecutionStatus;
  executionError: string | null;
  queryData: QueryResult | null;
  pageSize: number;
  setPageSize: (size: number) => void;
  page: number;
  setPage: (updater: (p: number) => number) => void;
  handleExecute: () => void;
  handleCancel: () => void;
  filter: string;
  setFilter: (f: string) => void;
}

export function RedisDataTab({
  selectedItem,
  connection,
  isLoading,
  executionStatus,
  executionError,
  queryData,
  pageSize,
  setPageSize,
  page,
  setPage,
  handleExecute,
  handleCancel,
  filter,
  setFilter,
}: RedisDataTabProps) {
  const [command, setCommand] = useState(filter || 'SCAN 0 COUNT 100');
  const [scanCursor, setScanCursor] = useState<string>('0');
  const [copiedCellKey, setCopiedCellKey] = useState<string | null>(null);
  const copiedTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const storeConnection = useAppStore((state) => state.activeConnection);
  const activeConnection = connection ?? storeConnection;
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  const resultsFontSize = useAppStore((s) => s.uiFontSize);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizing = useRef<{ column: string; startX: number; startWidth: number } | null>(null);
  const [prevColumns, setPrevColumns] = useState<string[]>([]);
  const [prevQueryData, setPrevQueryData] = useState<QueryResult | null>(null);
  const DEFAULT_COL_WIDTH = 180;

  if (queryData && queryData !== prevQueryData) {
    setPrevQueryData(queryData);
    if (queryData.nextCursor !== undefined && queryData.nextCursor !== null) {
      setScanCursor(queryData.nextCursor);
    }
    const newCols = queryData.columns.filter(c => !prevColumns.includes(c));
    if (newCols.length > 0) {
      setPrevColumns(queryData.columns);
      setColumnWidths(prev => {
        const next = { ...prev };
        for (const col of newCols) {
          if (!(col in next)) next[col] = DEFAULT_COL_WIDTH;
        }
        return next;
      });
    }
  }

  const handleResizeStart = (col: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = columnWidths[col] ?? DEFAULT_COL_WIDTH;
    resizing.current = { column: col, startX: e.clientX, startWidth };
    document.body.classList.add('col-resize-drag');

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const diff = ev.clientX - resizing.current.startX;
      const newWidth = Math.max(80, resizing.current.startWidth + diff);
      setColumnWidths(prev => ({ ...prev, [resizing.current!.column]: newWidth }));
    };

    const onMouseUp = () => {
      resizing.current = null;
      document.body.classList.remove('col-resize-drag');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleExecuteCommand = () => {
    setFilter(command);
    queueMicrotask(() => handleExecute());
  };


  const buildScanCommand = (cursor: string) => {
    const tokens = command.trim().split(/\s+/);
    const upper = tokens[0]?.toUpperCase() ?? 'SCAN';
    if (upper !== 'SCAN') return command;

    const rest = tokens.slice(2);
    return `SCAN ${cursor}${rest.length ? ' ' + rest.join(' ') : ''}`;
  };

  const handleScanPage = (cursor: string) => {
    const cmd = buildScanCommand(cursor);
    setCommand(cmd);
    setFilter(cmd);
    queueMicrotask(() => handleExecute());
  };

  const handlePrevPage = () => {
    setPage(() => 0);
    handleScanPage('0');
  };

  const handleNextPage = () => {
    const next = queryData?.nextCursor;
    if (!next || next === '0') return;
    setPage((p) => p + 1);
    handleScanPage(scanCursor);
  };

  const handleCopyCell = (value: DbValue, key: string) => {
    const text = value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    navigator.clipboard.writeText(text);
    const existing = copiedTimers.current.get(key);
    if (existing) clearTimeout(existing);
    setCopiedCellKey(key);
    copiedTimers.current.set(key, setTimeout(() => {
      setCopiedCellKey(prev => prev === key ? null : prev);
      copiedTimers.current.delete(key);
    }, 1500));
  };


  if (
    (selectedItem.type === 'view' || selectedItem.type === 'procedure') &&
    executionStatus === ExecutionStatus.IDLE
  ) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        <Zap className="w-12 h-12 text-amber-500 mb-4" />
        <h4 className="font-bold mb-2">
          {selectedItem.type === 'view' ? 'Browse Keys' : 'Execute Command'}
        </h4>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          {selectedItem.type === 'view'
            ? 'Browse Redis keys using SCAN or GET commands.'
            : 'Execute a Redis command on the server.'}{' '}
          Click the button to proceed.
        </p>
        <button
          onClick={() => handleExecute()}
          className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Zap className="w-4 h-4" />
          {selectedItem.type === 'view' ? 'Browse Keys' : 'Run Command'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">

      <div className="px-4 py-2 border-b border-border bg-muted/5 flex flex-col shrink-0">
        <div className="flex items-center gap-2 w-full">
          <div className="flex items-center gap-1.5 shrink-0">
            <Terminal className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[var(--ch-text-10)] font-bold text-muted-foreground uppercase tracking-wider">Redis</span>
          </div>
          <input
            className="flex-1 bg-background border border-border px-3 py-1 rounded text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
            placeholder="SCAN 0 COUNT 100"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleExecuteCommand();
              }
            }}
          />
          <button
            onClick={handleExecuteCommand}
            className="shrink-0 px-3 py-1 text-xs font-semibold bg-primary/10 text-primary border border-primary/20 rounded hover:bg-primary/20 transition-colors flex items-center gap-1"
          >
            <Zap className="w-3 h-3" />
            Run
          </button>
        </div>
      </div>
      {activeConnection?.environment === Environment.PRODUCTION && (
        <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-500 flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <p className="text-[var(--ch-text-11)] font-bold uppercase tracking-wider flex-1">Production — commands execute on live server</p>
        </div>
      )}
      {executionStatus === ExecutionStatus.ERROR && (
        <div className="p-4 bg-destructive/10 border-b border-destructive/20 text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <p className="text-xs font-mono">{executionError}</p>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-4">
            <div className="flex flex-col items-center gap-3 text-primary animate-pulse">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-sm font-bold uppercase tracking-widest">
                Executing...
              </span>
              <button
                onClick={handleCancel}
                className="bg-destructive/10 text-destructive border border-destructive/20 px-4 py-1.5 rounded text-xs font-bold hover:bg-destructive/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : queryData ? (
          <div className="min-w-full inline-block align-middle">
            <table
              className="min-w-full text-left border-collapse table-fixed"
              style={{ fontFamily: editorFontFamily, fontSize: resultsFontSize }}
            >
              <thead className="sticky top-0 bg-background border-b border-border z-10">
                <tr>
                  <th className="p-2 font-bold bg-muted/50 border-r border-border text-center w-10">
                    #
                  </th>
                  {queryData.columns.map((col) => (
                    <th
                      key={col}
                      className="p-2 font-bold bg-muted/50 truncate border-r border-border last:border-0 relative select-none cursor-pointer hover:bg-muted/70 transition-colors group"
                      style={{ width: columnWidths[col] ?? DEFAULT_COL_WIDTH, minWidth: 80, maxWidth: 600 }}
                      title={col}
                    >
                      <div className="flex items-center gap-1 pr-4">
                        <span className="truncate">{col}</span>
                        {queryData.columns.indexOf(col) === 0 ? (
                          <ChevronUp className="w-3 h-3 shrink-0 text-muted-foreground/30" />
                        ) : null}
                      </div>
                      <div
                        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleResizeStart(col, e);
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queryData.rows.map((row, i) => (
                  <tr
                    key={i}
                    className={`${i % 2 === 0 ? 'bg-background' : 'bg-muted/20'} border-b border-border/50 hover:bg-muted/30 whitespace-nowrap`}
                  >
                    <td className="p-2 border-r border-border text-center text-muted-foreground">
                      {i + 1}
                    </td>
                    {queryData.columns.map((col) => {
                      const value = row[col];
                      const cellKey = `${i}:${col}`;
                      return (
                        <td
                          key={col}
                          className="p-2 border-r border-border last:border-0 truncate relative group/cell"
                          style={{ width: columnWidths[col] ?? DEFAULT_COL_WIDTH, minWidth: 80, maxWidth: 600 }}
                        >
                          <div className="flex items-center gap-1">
                            <span className="truncate flex-1 min-w-0">
                              {value === null ? (
                                <span className="text-muted-foreground italic text-[var(--ch-text-10)]">NULL</span>
                              ) : (
                                formatCellValue(value)
                              )}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyCell(value, cellKey);
                              }}
                              className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors opacity-0 group-hover/cell:opacity-100"
                              title="Copy to clipboard"
                            >
                              {copiedCellKey === cellKey ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          executionStatus === ExecutionStatus.SUCCESS && (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">
              Command executed successfully but returned no data.
            </div>
          )
        )}
      </div>
      {queryData && (
        <div className="p-3 border-t border-border flex items-center justify-between bg-muted/10">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              Rows:{' '}
              <span className="font-bold text-foreground">
                {queryData.rows.length}
              </span>
            </span>
            <span>
              Execution:{' '}
              <span className="font-bold text-foreground">
                {queryData.executionTime}ms
              </span>
            </span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[var(--ch-text-10)] text-muted-foreground font-black uppercase tracking-widest opacity-70">
                Rows:
              </span>
              <div className="relative flex items-center group/select">
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="appearance-none text-[var(--ch-text-10)] bg-muted/30 border border-border/50 rounded-md pl-3 pr-8 py-1.5 outline-none font-black text-foreground transition-all hover:border-primary/40 hover:bg-muted/60 cursor-pointer shadow-inner"
                >
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                  <option value={1000}>1000 (Max)</option>
                </select>
                <div className="absolute right-2.5 pointer-events-none flex flex-col items-center justify-center opacity-50 group-hover/select:opacity-100 transition-opacity">
                  <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[4px] border-b-muted-foreground mb-[1px]" />
                  <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[4px] border-t-muted-foreground" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 0}
                onClick={handlePrevPage}
                className="p-1 hover:bg-muted rounded border border-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center justify-center min-w-[40px]">
                <span className="text-[var(--ch-text-10)] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  PAGE {page + 1}
                </span>
              </div>
              <button
                disabled={!queryData.nextCursor || queryData.nextCursor === '0'}
                onClick={handleNextPage}
                className="p-1 hover:bg-muted rounded border border-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next Page"
              >
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
