import {
  Loader2,
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  ChevronDown,
  ChevronUp,
  Layout,
  Code,
  Play,
  Check,
  X,
  Copy,
  FileCode,
  Diff,
  ArrowRightLeft,
  Terminal,
} from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  QueryResult,
  ExecutionStatus,
  DatabaseObject,
  DbRow,
  DbValue,
} from '@/types/database';
import { Environment } from '@/types/database';
import { ModelExportModal } from '../ModelExportModal';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { formatCellValue } from '@/lib/formatCellValue';

interface DataTabProps {
  selectedItem: DatabaseObject;
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
  updateCell: (row: DbRow, column: string, newValue: DbValue) => void;
  filter: string;
  setFilter: (f: string) => void;
}

/** State for the visual diff confirmation panel. */
interface PendingCellEdit {
  row: DbRow;
  column: string;
  prevValue: DbValue;
  nextValue: string;
}

/** State for the inline SQL preview panel. */
interface SqlPreviewState {
  isOpen: boolean;
  sql: string;
  title: string;
}

export function DataTab({
  selectedItem,
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
  updateCell,
  filter,
  setFilter,
}: DataTabProps) {
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    column: string;
  } | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    rowIndex: number;
    column: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [sortState, setSortState] = useState<{
    column: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const copiedTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [copiedCellKey, setCopiedCellKey] = useState<string | null>(null);

  const SQL_ACTIONS = ['SELECT', 'UPDATE', 'INSERT', 'DELETE', 'JSON'] as const;
  type SqlAction = (typeof SQL_ACTIONS)[number];

  // Undo/Redo history
  const [history, setHistory] = useState<
    { row: DbRow; col: string; prev: DbValue; next: DbValue }[]
  >([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    row: DbRow;
    rowIndex: number;
  } | null>(null);

  // Phase 9 — Inline SQL preview panel (replaces SqlGeneratorModal)
  const [sqlPreview, setSqlPreview] = useState<SqlPreviewState>({
    isOpen: false,
    sql: '',
    title: '',
  });

  // Phase 9 — Visual diff before committing a cell edit
  const [pendingEdit, setPendingEdit] = useState<PendingCellEdit | null>(null);

  const [modelModalOpen, setModelModalOpen] = useState(false);
  const activeConnection = useAppStore((state) => state.activeConnection);
  const isMongo = activeConnection?.type === 'mongodb';
  const [showAdvancedMongo, setShowAdvancedMongo] = useState(false);
  const sqlPreviewRef = useRef<HTMLDivElement>(null);
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  const resultsFontSize = useAppStore((s) => s.resultsFontSize);

  const [mongoInputs, setMongoInputs] = useState(() => {
    if (!filter) return { $find: '', $project: '', $sort: '', $collation: '', $hint: '' };
    try {
      const parsed = JSON.parse(filter);
      if (parsed.$find !== undefined || parsed.$project !== undefined || parsed.$sort !== undefined) {
        const val = (v: unknown) => (typeof v === 'string' ? v : v ? JSON.stringify(v) : '');
        return {
          $find: val(parsed.$find),
          $project: val(parsed.$project),
          $sort: val(parsed.$sort),
          $collation: val(parsed.$collation),
          $hint: val(parsed.$hint),
        };
      }
      return { $find: filter, $project: '', $sort: '', $collation: '', $hint: '' };
    } catch {
      return { $find: filter, $project: '', $sort: '', $collation: '', $hint: '' };
    }
  });

  const executeRef = useRef(handleExecute);

  useEffect(() => {
    executeRef.current = handleExecute;
  }, [handleExecute]);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'col-resize-drag-style';
    style.textContent = '.col-resize-drag { cursor: col-resize !important; user-select: none !important; }';
    document.head.appendChild(style);
    return () => { const s = document.getElementById('col-resize-drag-style'); if (s) s.remove(); };
  }, []);

  const DEFAULT_COL_WIDTH = 180;
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizing = useRef<{ column: string; startX: number; startWidth: number } | null>(null);
  const prevColumns = useRef<string[]>([]);

  useEffect(() => {
    if (!queryData) return;
    const newCols = queryData.columns.filter(c => !prevColumns.current.includes(c));
    if (newCols.length === 0) return;
    setColumnWidths(prev => {
      const next = { ...prev };
      for (const col of newCols) {
        if (!(col in next)) next[col] = DEFAULT_COL_WIDTH;
      }
      return next;
    });
    prevColumns.current = queryData.columns;
  }, [queryData]);

  const handleSortToggle = (col: string) => {
    setSortState(prev => {
      if (prev?.column === col) {
        if (prev.direction === 'asc') return { column: col, direction: 'desc' };
        return null;
      }
      return { column: col, direction: 'asc' };
    });
  };

  const sortedRows = queryData?.rows
    ? [...queryData.rows].sort((a, b) => {
        if (!sortState) return 0;
        const aVal = a[sortState.column];
        const bVal = b[sortState.column];
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        let cmp = 0;
        const aIsNum = typeof aVal === 'number';
        const bIsNum = typeof bVal === 'number';
        if (aIsNum && bIsNum) {
          cmp = aVal - bVal;
        } else if (typeof aVal === 'string' && typeof bVal === 'string') {
          cmp = aVal.localeCompare(bVal);
        } else {
          const aStr = typeof aVal === 'object' ? JSON.stringify(aVal) : String(aVal);
          const bStr = typeof bVal === 'object' ? JSON.stringify(bVal) : String(bVal);
          cmp = aStr.localeCompare(bStr);
        }
        return sortState.direction === 'desc' ? -cmp : cmp;
      })
    : queryData?.rows ?? [];

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

  const handleMongoFilterExecute = () => {
    const payload: Record<string, string> = {};
    if (mongoInputs.$find.trim()) payload.$find = mongoInputs.$find.trim();
    if (mongoInputs.$project.trim()) payload.$project = mongoInputs.$project.trim();
    if (mongoInputs.$sort.trim()) payload.$sort = mongoInputs.$sort.trim();
    if (mongoInputs.$collation.trim()) payload.$collation = mongoInputs.$collation.trim();
    if (mongoInputs.$hint.trim()) payload.$hint = mongoInputs.$hint.trim();
    setFilter(JSON.stringify(payload));
    queueMicrotask(() => executeRef.current());
  };

  const handleStartEdit = (
    rowIndex: number,
    column: string,
    value: DbValue,
  ) => {
    if (selectedItem.type !== 'table') return;
    setEditingCell({ rowIndex, column });
    setEditValue(value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  };

  /**
   * Phase 9 — Visual Diff: instead of immediately calling updateCell,
   * we stage the edit in pendingEdit so the user can review the diff panel
   * before confirming. This prevents accidental mutations in production.
   */
  const handleSaveEdit = (row: DbRow) => {
    if (!editingCell) return;
    const prevValue = row[editingCell.column];
    // Stage for diff review
    setPendingEdit({
      row,
      column: editingCell.column,
      prevValue,
      nextValue: editValue,
    });
    setEditingCell(null);
  };

  /** Phase 9 — Confirm a staged pending cell edit after visual diff review. */
  const confirmPendingEdit = () => {
    if (!pendingEdit) return;
    updateCell(pendingEdit.row, pendingEdit.column, pendingEdit.nextValue);
    // Persist in undo/redo history
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      row: pendingEdit.row,
      col: pendingEdit.column,
      prev: pendingEdit.prevValue,
      next: pendingEdit.nextValue,
    });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setPendingEdit(null);
  };

  const discardPendingEdit = () => setPendingEdit(null);


  const undo = useCallback(() => {
    if (historyIndex >= 0) {
      const change = history[historyIndex];
      updateCell(change.row, change.col, change.prev);
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex, updateCell]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const change = history[nextIndex];
      updateCell(change.row, change.col, change.next);
      setHistoryIndex(nextIndex);
    }
  }, [history, historyIndex, updateCell]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  const onInputKeyDown = (e: React.KeyboardEvent, row: DbRow) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSaveEdit(row);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setEditingCell(null);
    }
  };

  const handleGenerateSql = async (action: SqlAction) => {
    if (!contextMenu || !activeConnection || !queryData) return;

    const pks = queryData.primary_keys || [];
    const primary_keys = pks.reduce(
      (acc, pk) => {
        if (contextMenu.row[pk] !== undefined) acc[pk] = contextMenu.row[pk];
        return acc;
      },
      {} as Record<string, DbValue>,
    );

    try {
      if (action === 'JSON') {
        const jsonStr = JSON.stringify(contextMenu.row, null, 2);
        // Phase 9: show inline preview panel, not a blocking modal
        setSqlPreview({ isOpen: true, sql: jsonStr, title: 'Row — JSON Export' });
      } else {
        const sql = await invoke<string>('generate_sql', {
          id: activeConnection.id,
          action: action.toLowerCase(),
          context: {
            table: selectedItem.name,
            primary_keys,
            data: contextMenu.row,
          },
        });
        // Phase 9: show inline preview panel
        setSqlPreview({ isOpen: true, sql, title: `Generated ${action}` });
      }
    } catch (e) {
      console.error('Failed to generate SQL:', e);
    }
  };


  if (
    (selectedItem.type === 'view' || selectedItem.type === 'procedure') &&
    executionStatus === 'idle'
  ) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        {selectedItem.type === 'view' ? (
          <Layout className="w-12 h-12 text-muted-foreground mb-4" />
        ) : (
          <Code className="w-12 h-12 text-muted-foreground mb-4" />
        )}
        <h4 className="font-bold mb-2">
          {selectedItem.type === 'view' ? 'View Data' : 'Execute Procedure'}
        </h4>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          {selectedItem.type === 'view'
            ? 'Viewing data from a view may take time.'
            : 'Executing a procedure will run its code on the server.'}{' '}
          Click the button to proceed via WebSocket.
        </p>
        <button
          onClick={() => handleExecute()}
          className="bg-primary text-primary-foreground px-6 py-2 rounded-lg font-bold hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Play className="w-4 h-4 fill-current" />
          {selectedItem.type === 'view' ? 'Execute View' : 'Run Procedure'}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col min-h-0 min-w-0 relative"
      onClick={() => { setContextMenu(null); setSelectedCell(null); }}
    >
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onDismiss={() => setContextMenu(null)}
          groups={[
            {
              title: isMongo ? 'Schema Query Actions' : 'SQL Actions',
              items: SQL_ACTIONS.map(action => ({
                label: `Generate ${action}`,
                shortcut: `⌘${action[0]}`,
                icon: <FileCode className="w-3.5 h-3.5" />,
                onClick: () => handleGenerateSql(action)
              }))
            },
            {
              title: 'Row Actions',
              items: [
                {
                  label: 'Export Model...',
                  icon: <Code className="w-3.5 h-3.5" />,
                  onClick: () => { setModelModalOpen(true); setContextMenu(null); }
                }
              ]
            }
          ]}
        />
      )}

      <ModelExportModal
        isOpen={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        tableName={selectedItem.name}
      />

      <div className="px-4 py-2 border-b border-border bg-muted/5 flex flex-col shrink-0">
        <div className="flex items-center gap-2 w-full">
          {isMongo ? (
            <div className="flex-1 max-w-xl">
              <input
                className="bg-background border border-border px-3 py-1 rounded text-xs outline-none focus:ring-1 focus:ring-primary w-full"
                placeholder='Filter document (e.g. { "status": "active" })'
                value={mongoInputs.$find}
                onChange={(e) => setMongoInputs(p => ({ ...p, $find: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleMongoFilterExecute();
                  }
                }}
              />
            </div>
          ) : (
            <input
              className="bg-background border border-border px-3 py-1 rounded text-xs outline-none focus:ring-1 focus:ring-primary w-64"
              placeholder="WHERE clause (e.g. id > 10)"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleExecute();
                }
              }}
            />
          )}

          {isMongo && (
            <button
              onClick={() => setShowAdvancedMongo(!showAdvancedMongo)}
              className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/50 transition-colors"
            >
              Advanced
              {showAdvancedMongo ? <ChevronDown className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
            </button>
          )}
        </div>
        
        {isMongo && showAdvancedMongo && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs w-full max-w-xl bg-background/50 p-2 rounded border border-border/50">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">Project</span>
              <input
                className="bg-background border border-border px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary"
                placeholder='{ "name": 1 }'
                value={mongoInputs.$project}
                onChange={(e) => setMongoInputs(p => ({ ...p, $project: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleMongoFilterExecute()}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">Sort</span>
              <input
                className="bg-background border border-border px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary"
                placeholder='{ "age": -1 }'
                value={mongoInputs.$sort}
                onChange={(e) => setMongoInputs(p => ({ ...p, $sort: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleMongoFilterExecute()}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">Collation</span>
              <input
                className="bg-background border border-border px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary"
                placeholder='{ "locale": "en" }'
                value={mongoInputs.$collation}
                onChange={(e) => setMongoInputs(p => ({ ...p, $collation: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleMongoFilterExecute()}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">Hint</span>
              <input
                className="bg-background border border-border px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary"
                placeholder='{ "name_1": 1 } or "name_1"'
                value={mongoInputs.$hint}
                onChange={(e) => setMongoInputs(p => ({ ...p, $hint: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleMongoFilterExecute()}
              />
            </div>
          </div>
        )}
      </div>
      {activeConnection?.environment === Environment.PRODUCTION && (
        <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-500 flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <p className="text-[11px] font-bold uppercase tracking-wider flex-1">Production — inline edits require explicit Commit to persist</p>
        </div>
      )}
      {executionStatus === 'error' && (
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
                Loading data...
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
            <table className="min-w-full text-left border-collapse table-fixed" style={{ fontFamily: editorFontFamily, fontSize: resultsFontSize }}>
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
                      onClick={() => handleSortToggle(col)}
                    >
                      <div className="flex items-center gap-1 pr-4">
                        <span className="truncate">{col}</span>
                        {sortState?.column === col ? (
                          sortState.direction === 'asc' ? (
                            <ChevronUp className="w-3 h-3 shrink-0 text-primary" />
                          ) : (
                            <ChevronDown className="w-3 h-3 shrink-0 text-primary" />
                          )
                        ) : (
                          <ChevronUp className="w-3 h-3 shrink-0 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
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
                {sortedRows.map((row, i) => (
                  <tr
                    key={i}
                    className={`${i === selectedRowIndex ? 'bg-muted' : 'border-b border-border/50 hover:bg-muted/30'} whitespace-nowrap`}
                    onClick={(e) => { e.stopPropagation(); setSelectedRowIndex(i); }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.pageX, y: e.pageY, row, rowIndex: i });
                    }}
                  >
                    <td className="p-2 border-r cursor-pointer border-border text-center text-muted-foreground">
                      {i + 1}
                    </td>
                    {queryData.columns.map((col) => {
                      const value = row[col];
                      const isSelectedCell = selectedCell?.rowIndex === i && selectedCell?.column === col;
                      return (
                        <td
                          key={col}
                          className={cn(
                            "p-2 border-r border-border last:border-0 truncate cursor-text relative group/cell",
                            isSelectedCell && "ring-1 ring-primary/50 bg-primary/5"
                          )}
                          style={{ width: columnWidths[col] ?? DEFAULT_COL_WIDTH, minWidth: 80, maxWidth: 600 }}
                          onClick={(e) => { e.stopPropagation(); setSelectedCell({ rowIndex: i, column: col }); }}
                          onDoubleClick={() => handleStartEdit(i, col, value)}
                          title="Double-click to edit"
                        >
                          {editingCell?.rowIndex === i &&
                          editingCell?.column === col ? (
                            <div
                              className="flex items-center gap-1 bg-background"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                autoFocus
                                className="w-full bg-muted border border-border px-1 py-0.5 rounded outline-none"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => onInputKeyDown(e, row)}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSaveEdit(row);
                                }}
                                className="text-primary hover:text-primary/80 transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCell(null);
                                }}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="truncate flex-1 min-w-0">
                                {value === null ? (
                                  <span className="text-muted-foreground italic text-[10px]">NULL</span>
                                ) : (
                                  formatCellValue(value)
                                )}
                              </span>
                              {isSelectedCell && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const text = value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
                                    navigator.clipboard.writeText(text);
                                    const key = `${i}:${col}`;
                                    const existing = copiedTimers.current.get(key);
                                    if (existing) clearTimeout(existing);
                                    setCopiedCellKey(key);
                                    copiedTimers.current.set(key, setTimeout(() => {
                                      setCopiedCellKey(prev => prev === key ? null : prev);
                                      copiedTimers.current.delete(key);
                                    }, 1500));
                                  }}
                                  className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                  title="Copy to clipboard"
                                >
                                  {copiedCellKey === `${i}:${col}` ? (
                                    <Check className="w-3 h-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          executionStatus === 'success' && (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">
              Query executed successfully but returned no data.
            </div>
          )
        )}
      </div>
      {queryData &&
        (selectedItem.type === 'table' || selectedItem.type === 'view') && (
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
                <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-70">
                  Rows:
                </span>
                <div className="relative flex items-center group/select">
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="appearance-none text-[10px] bg-muted/30 border border-border/50 rounded-md pl-3 pr-8 py-1.5 outline-none font-black text-foreground transition-all hover:border-primary/40 hover:bg-muted/60 cursor-pointer shadow-inner"
                  >
                    <option value={10}>10</option>
                    <option value={50}>50</option>
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
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="p-1 hover:bg-muted rounded border border-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center justify-center min-w-[40px]">
                  <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    PAGE {page + 1}
                  </span>
                </div>
                <button
                  disabled={queryData.rows.length < pageSize}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1 hover:bg-muted rounded border border-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Next Page"
                >
                  <ChevronRightIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Phase 9: Visual Diff Panel for cell edits */}
      {pendingEdit && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col w-[400px] animate-in slide-in-from-bottom-4">
          <div className="bg-muted/50 px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Diff className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider">Review Change</span>
            </div>
            <button onClick={discardPendingEdit} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3 text-xs space-y-2 font-mono bg-muted/10">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Column</span>
              <span className="font-bold text-foreground">{pendingEdit.column}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-2 border-t border-border/50">
              <div className="p-2 bg-destructive/10 text-destructive rounded overflow-x-auto whitespace-nowrap">
                {formatCellValue(pendingEdit.prevValue) || <span className="italic opacity-50">NULL</span>}
              </div>
              <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
              <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded overflow-x-auto whitespace-nowrap">
                {pendingEdit.nextValue || <span className="italic opacity-50">EMPTY</span>}
              </div>
            </div>
          </div>
          <div className="p-2 bg-muted/30 border-t border-border flex justify-end gap-2">
            <button
              onClick={discardPendingEdit}
              className="px-3 py-1.5 text-xs font-medium hover:bg-muted rounded"
            >
              Discard
            </button>
            <button
              onClick={confirmPendingEdit}
              className="px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              Commit
            </button>
          </div>
        </div>
      )}

      {/* Phase 9: Inline SQL Preview Panel */}
      <div
        ref={sqlPreviewRef}
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-background border-t border-border shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)] transition-all duration-300 ease-in-out z-40 flex flex-col",
          sqlPreview.isOpen ? "h-[40%] opacity-100 translate-y-0" : "h-0 opacity-0 translate-y-full pointer-events-none"
        )}
      >
        <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold tracking-wide">{sqlPreview.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(sqlPreview.sql);
                // Optional: show small toast here
              }}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              title="Copy to clipboard"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            <button
              onClick={() => setSqlPreview(prev => ({ ...prev, isOpen: false }))}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-[#0d1117] p-4">
          <pre className="text-xs font-mono text-[#c9d1d9] whitespace-pre-wrap break-all leading-relaxed">
            {sqlPreview.sql}
          </pre>
        </div>
      </div>
    </div>
  );
}
