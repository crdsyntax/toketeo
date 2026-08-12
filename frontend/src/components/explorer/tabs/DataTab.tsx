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
  Terminal,
  Table2,
  Rows3,
  FileJson,
  Eye,
  PenLine,
  Trash2,
  Eraser,
  Clock,
} from 'lucide-react';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  QueryResult,
  DatabaseObject,
  DbRow,
  DbValue,
  CellValue,
  ColumnResponse,
  Connection,
} from '@/types/database';
import { ExecutionStatus, Environment, DatabaseType } from '@/types/database';
import { ModelExportModal } from '../ModelExportModal';
import { ContextMenu, type ContextMenuGroup } from '@/components/ui/ContextMenu';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore, type DataTabViewMode } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { formatCellValue } from '@/lib/formatCellValue';
import { Button } from '@/components/ui/Button';
import { ReviewChangePanel } from '@/components/ui/ReviewChangePanel';
import { JsonResultsView } from '@/components/ui/JsonResultsView';
import { DataListView } from './DataListView';
import {
  generateDeleteByIds,
  generateSelectByIds,
  generateUpdateByIds,
  parseInputValue,
} from '@/lib/sqlGenerator';
import { toast } from 'react-hot-toast';

interface DataTabProps {
  selectedItem: DatabaseObject;
  connection?: Connection | null;
  columns?: ColumnResponse[];
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
  updateCell: (row: DbRow, column: string, newValue: CellValue) => void;
  filter: string;
  setFilter: (f: string) => void;
  currentSchema?: string;
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
  connection,
  columns,
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
  currentSchema,
}: DataTabProps) {
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    column: string;
  } | null>(null);
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
    column?: string;
    dateTime?: boolean;
  } | null>(null);

  // Phase 9 — Inline SQL preview panel (replaces SqlGeneratorModal)
  const [sqlPreview, setSqlPreview] = useState<SqlPreviewState>({
    isOpen: false,
    sql: '',
    title: '',
  });

  // Phase 9 — Visual diff before committing a cell edit
  const [pendingEdit, setPendingEdit] = useState<PendingCellEdit | null>(null);
  // Position (viewport-fixed) for the Review Change panel, computed from the
  // edited cell so it appears near the column being edited.
  const [reviewPos, setReviewPos] = useState<{ top: number; left: number } | null>(null);
  const editingCellRef = useRef<HTMLTableCellElement | null>(null);

  // Multi-row selection (indices into `sortedRows`)
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<Set<number>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [batchModal, setBatchModal] = useState<'update' | 'truncate' | null>(null);
  const [batchColumn, setBatchColumn] = useState<string>('');
  const [batchValue, setBatchValue] = useState<string>('');
  const [truncateColumns, setTruncateColumns] = useState<string[]>([]);

  const [modelModalOpen, setModelModalOpen] = useState(false);
  const storeConnection = useAppStore((state) => state.activeConnection);
  const openTab = useAppStore((state) => state.openTab);
  const setActiveConnectionDatabase = useAppStore((state) => state.setActiveConnectionDatabase);
  const activeConnection = connection ?? storeConnection;
  const navigate = useNavigate();
  const isMongo = activeConnection?.type === DatabaseType.MONGODB;
  const [showAdvancedMongo, setShowAdvancedMongo] = useState(false);
  const sqlPreviewRef = useRef<HTMLDivElement>(null);
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  const resultsFontSize = useAppStore((s) => s.uiFontSize);
  const inlineEditReview = useAppStore((s) => s.inlineEditReview);
  const viewMode = useAppStore((s) => s.dataTabViewMode);
  const setViewMode = useAppStore((s) => s.setDataTabViewMode);

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

  const sortedRows = useMemo(() => {
    if (!queryData?.rows) return [];
    if (!sortState) return [...queryData.rows];
    return [...queryData.rows].sort((a, b) => {
      const aVal = a[sortState.column];
      const bVal = b[sortState.column];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      let cmp: number;
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
    });
  }, [queryData, sortState]);

  const primaryKeys = useMemo(() => queryData?.primary_keys ?? [], [queryData]);

  // Metadata de columnas para edición inteligente:
  //  - enum → <select> con las opciones registradas
  //  - boolean/tinyint(1) → switch
  //  - date/time → acción de menú contextual "Set NOW()"
  const columnMeta = useMemo(() => {
    const map: Record<string, ColumnResponse> = {};
    for (const c of columns ?? []) map[c.name] = c;
    return map;
  }, [columns]);

  const enumValuesFor = (col: string): string[] => columnMeta[col]?.enumValues ?? [];

  const isBooleanColumn = (col: string): boolean => {
    const t = (columnMeta[col]?.type ?? '').toLowerCase();
    return t === 'boolean' || t === 'bool' || t === 'tinyint(1)';
  };

  const isDateTimeColumn = (col: string): boolean => {
    const t = (columnMeta[col]?.type ?? '').toLowerCase();
    return t.includes('date') || t.includes('time');
  };

  /** Tipo completo de la columna (p.ej. numeric(10,4), vector(768)) si la
   *  metadata está disponible; si no, el tipo corto del result set. */
  const columnTypeDisplay = (col: string, idx: number): string =>
    columnMeta[col]?.type || queryData?.columnTypes?.[idx] || '';

  /** Representación on/off para columnas booleanas según el motor. */
  const booleanRepr = (col: string): { on: string; off: string } => {
    const t = (columnMeta[col]?.type ?? '').toLowerCase();
    return t === 'boolean' || t === 'bool'
      ? { on: 'true', off: 'false' }
      : { on: '1', off: '0' };
  };

  const selectedRows = useMemo(
    () => [...selectedRowIndexes].map((i) => sortedRows[i]).filter(Boolean),
    [selectedRowIndexes, sortedRows],
  );

  // Reset the selection whenever a new result set is loaded.
  const [prevQueryData, setPrevQueryData] = useState<QueryResult | null>(queryData);
  if (queryData !== prevQueryData) {
    setPrevQueryData(queryData);
    setSelectedRowIndexes(new Set());
    setSelectionAnchor(null);
    setBatchModal(null);
    setTruncateColumns([]);
    setBatchValue('');
  }

  const toggleRowSelection = useCallback((index: number) => {
    setSelectedRowIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleRowClick = useCallback((e: React.MouseEvent, index: number) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedRowIndexes((prev) => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
      setSelectionAnchor(index);
    } else if (e.shiftKey) {
      const anchor = selectionAnchor ?? index;
      const [from, to] = anchor <= index ? [anchor, index] : [index, anchor];
      setSelectedRowIndexes((prev) => {
        const next = new Set(prev);
        for (let idx = from; idx <= to; idx++) next.add(idx);
        return next;
      });
    } else {
      setSelectedRowIndexes(new Set([index]));
      setSelectionAnchor(index);
    }
  }, [selectionAnchor]);

  const clearRowSelection = useCallback(() => setSelectedRowIndexes(new Set()), []);

  const handleBatchSelect = useCallback(() => {
    if (!queryData || selectedRows.length === 0) return;
    const sql = generateSelectByIds(selectedItem.name, selectedRows, primaryKeys, activeConnection?.type);
    if (!sql) {
      toast.error('No primary key / identity columns available to identify the selected rows');
      return;
    }
    setSqlPreview({ isOpen: true, sql, title: `Select by IDs (${selectedRows.length} row${selectedRows.length > 1 ? 's' : ''})` });
  }, [queryData, selectedRows, primaryKeys, selectedItem.name, activeConnection?.type, setSqlPreview]);

  const handleBatchDelete = useCallback(() => {
    if (!queryData || selectedRows.length === 0) return;
    const sql = generateDeleteByIds(selectedItem.name, selectedRows, primaryKeys, activeConnection?.type);
    if (!sql) {
      toast.error('No primary key / identity columns available to identify the selected rows');
      return;
    }
    setSqlPreview({ isOpen: true, sql, title: `Delete by IDs (${selectedRows.length} row${selectedRows.length > 1 ? 's' : ''})` });
  }, [queryData, selectedRows, primaryKeys, selectedItem.name, activeConnection?.type, setSqlPreview]);

  const handleBatchUpdate = useCallback(() => {
    if (!queryData || selectedRows.length === 0 || !batchColumn) return;
    const sql = generateUpdateByIds(
      selectedItem.name,
      selectedRows,
      primaryKeys,
      [{ column: batchColumn, value: parseInputValue(batchValue) }],
      activeConnection?.type,
    );
    if (!sql) {
      toast.error('No primary key / identity columns available to identify the selected rows');
      return;
    }
    setBatchModal(null);
    setSqlPreview({ isOpen: true, sql, title: `Update by IDs (${selectedRows.length} row${selectedRows.length > 1 ? 's' : ''})` });
  }, [queryData, selectedRows, primaryKeys, selectedItem.name, activeConnection?.type, batchColumn, batchValue, setBatchModal, setSqlPreview]);

  const handleBatchTruncate = useCallback(() => {
    if (!queryData || selectedRows.length === 0 || truncateColumns.length === 0) return;
    const sql = generateUpdateByIds(
      selectedItem.name,
      selectedRows,
      primaryKeys,
      truncateColumns.map((c) => ({ column: c, value: null })),
      activeConnection?.type,
    );
    if (!sql) {
      toast.error('No primary key / identity columns available to identify the selected rows');
      return;
    }
    setBatchModal(null);
    setSqlPreview({ isOpen: true, sql, title: `Set NULL (${truncateColumns.length} column${truncateColumns.length > 1 ? 's' : ''}, ${selectedRows.length} row${selectedRows.length > 1 ? 's' : ''})` });
  }, [queryData, selectedRows, primaryKeys, selectedItem.name, activeConnection?.type, truncateColumns, setBatchModal, setSqlPreview]);

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
    // When the Review Change panel is disabled (Settings → Query Editor →
    // Inline edition), apply the edit immediately.
    if (!inlineEditReview) {
      updateCell(row, editingCell.column, editValue);
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({
        row,
        col: editingCell.column,
        prev: prevValue,
        next: editValue,
      });
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setEditingCell(null);
      return;
    }
    // Place the review panel next to the edited cell: centered under it when
    // the cell is in the upper half of the viewport, above it otherwise.
    const PANEL_W = 400;
    const PANEL_H = 210;
    const rect = editingCellRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - PANEL_W / 2, 8),
        Math.max(8, window.innerWidth - PANEL_W - 8),
      );
      const below = rect.top + rect.height / 2 < window.innerHeight / 2;
      const top = below
        ? Math.min(rect.bottom + 8, window.innerHeight - PANEL_H - 8)
        : Math.max(8, rect.top - PANEL_H - 8);
      setReviewPos({ top: Math.max(8, top), left });
    } else {
      setReviewPos(null);
    }
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
    setReviewPos(null);
  };

  const discardPendingEdit = () => { setPendingEdit(null); setReviewPos(null); };


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
        setContextMenu(null);
        // Enviar la consulta al SQL editor en un nuevo script, ligado a la
        // conexión/esquema actuales.
        if (currentSchema && storeConnection?.id === activeConnection.id) {
          setActiveConnectionDatabase(currentSchema);
        }
        openTab(`Generated ${action} — ${selectedItem.name}`, sql, activeConnection.id);
        navigate('/query');
      }
    } catch (e) {
      console.error('Failed to generate SQL:', e);
    }
  };


  const buildMenuGroups = (
    menu: NonNullable<typeof contextMenu>,
  ): ContextMenuGroup[] => {
    const groups: ContextMenuGroup[] = [];
    if (menu.column && menu.dateTime) {
      groups.push({
        title: 'Cell Actions',
        items: [
          {
            label: 'Set NOW()',
            icon: <Clock className="w-3.5 h-3.5" />,
            onClick: () => updateCell(menu.row, menu.column!, { __expr: 'NOW()' }),
          },
        ],
      });
    }
    groups.push({
      title: isMongo ? 'Schema Query Actions' : 'SQL Actions',
      items: SQL_ACTIONS.map((action) => ({
        label: `Generate ${action}`,
        shortcut: `⌘${action[0]}`,
        icon: <FileCode className="w-3.5 h-3.5" />,
        onClick: () => handleGenerateSql(action),
      })),
    });
    groups.push({
      title: 'Row Actions',
      items: [
        {
          label: 'Export Model...',
          icon: <Code className="w-3.5 h-3.5" />,
          onClick: () => setModelModalOpen(true),
        },
      ],
    });
    return groups;
  };


  if (
    (selectedItem.type === 'view' || selectedItem.type === 'procedure') &&
    executionStatus === ExecutionStatus.IDLE
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
        <Button onClick={() => handleExecute()}>
          <Play className="w-4 h-4 fill-current" />
          {selectedItem.type === 'view' ? 'Execute View' : 'Run Procedure'}
        </Button>
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
          groups={buildMenuGroups(contextMenu)}
        />
      )}

      <ModelExportModal
        isOpen={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        tableName={selectedItem.name}
        connection={activeConnection}
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

          {isMongo && (
            <div className="ml-auto flex items-center bg-muted/30 p-0.5 rounded-md border border-border/40">
              {([
                { mode: 'table' as DataTabViewMode, icon: <Table2 className="w-3.5 h-3.5" />, title: 'Table View' },
                { mode: 'list' as DataTabViewMode, icon: <Rows3 className="w-3.5 h-3.5" />, title: 'List View' },
                { mode: 'json' as DataTabViewMode, icon: <FileJson className="w-3.5 h-3.5" />, title: 'JSON View' },
              ]).map(({ mode, icon, title }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "px-2 py-1 text-[var(--ch-text-10)] font-medium rounded-sm transition-colors",
                    viewMode === mode
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title={title}
                >
                  {icon}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {isMongo && showAdvancedMongo && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs w-full max-w-xl bg-background/50 p-2 rounded border border-border/50">
            <div className="flex flex-col gap-1">
              <span className="text-[var(--ch-text-10)] text-muted-foreground font-semibold uppercase">Project</span>
              <input
                className="bg-background border border-border px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary"
                placeholder='{ "name": 1 }'
                value={mongoInputs.$project}
                onChange={(e) => setMongoInputs(p => ({ ...p, $project: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleMongoFilterExecute()}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[var(--ch-text-10)] text-muted-foreground font-semibold uppercase">Sort</span>
              <input
                className="bg-background border border-border px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary"
                placeholder='{ "age": -1 }'
                value={mongoInputs.$sort}
                onChange={(e) => setMongoInputs(p => ({ ...p, $sort: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleMongoFilterExecute()}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[var(--ch-text-10)] text-muted-foreground font-semibold uppercase">Collation</span>
              <input
                className="bg-background border border-border px-2 py-1 rounded outline-none focus:ring-1 focus:ring-primary"
                placeholder='{ "locale": "en" }'
                value={mongoInputs.$collation}
                onChange={(e) => setMongoInputs(p => ({ ...p, $collation: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleMongoFilterExecute()}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[var(--ch-text-10)] text-muted-foreground font-semibold uppercase">Hint</span>
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
          <p className="text-[var(--ch-text-11)] font-bold uppercase tracking-wider flex-1">Production — inline edits require explicit Commit to persist</p>
        </div>
      )}
      {executionStatus === ExecutionStatus.ERROR && (
        <div className="p-4 bg-destructive/10 border-b border-destructive/20 text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <p className="text-xs font-mono">{executionError}</p>
        </div>
      )}
      {selectedRows.length > 0 && !isMongo && selectedItem.type === 'table' && (
        <div className="px-4 py-1.5 border-b border-border bg-primary/5 flex items-center gap-1 flex-wrap shrink-0">
          <span className="text-xs font-black text-primary uppercase tracking-wider mr-1">
            {selectedRows.length} row{selectedRows.length > 1 ? 's' : ''} selected
          </span>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={handleBatchSelect}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[var(--ch-text-11)] font-bold uppercase tracking-wide bg-background border border-border/60 text-foreground hover:border-primary/50 hover:text-primary transition-colors"
            title="Generate SELECT using the selected primary keys"
          >
            <Eye className="w-3 h-3" />
            Select
          </button>
          <button
            onClick={() => { setBatchModal('update'); setContextMenu(null); }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[var(--ch-text-11)] font-bold uppercase tracking-wide bg-background border border-border/60 text-foreground hover:border-primary/50 hover:text-primary transition-colors"
            title="Generate UPDATE for the selected rows"
          >
            <PenLine className="w-3 h-3" />
            Update
          </button>
          <button
            onClick={() => { setBatchModal('truncate'); setContextMenu(null); }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[var(--ch-text-11)] font-bold uppercase tracking-wide bg-background border border-border/60 text-foreground hover:border-primary/50 hover:text-primary transition-colors"
            title="Set the chosen fields to NULL on the selected rows"
          >
            <Eraser className="w-3 h-3" />
            Set Null
          </button>
          <button
            onClick={handleBatchDelete}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[var(--ch-text-11)] font-bold uppercase tracking-wide bg-background border border-border/60 text-destructive hover:border-destructive/60 hover:bg-destructive/10 transition-colors"
            title="Generate DELETE for the selected rows"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
          <div className="flex-1" />
          <button
            onClick={clearRowSelection}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Clear selection"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
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
          isMongo && viewMode === 'list' ? (
            <DataListView
              rows={sortedRows}
              indexOffset={page * pageSize}
              fontFamily={editorFontFamily}
              fontSize={resultsFontSize}
            />
          ) : isMongo && viewMode === 'json' ? (
            <div className="h-full relative">
              <JsonResultsView rows={sortedRows} />
            </div>
          ) : (
          <div className="min-w-full inline-block align-middle">
            <table className="min-w-full text-left border-collapse table-fixed" style={{ fontFamily: editorFontFamily, fontSize: resultsFontSize }}>
              <thead className="sticky top-0 bg-background border-b border-border z-10">
                <tr>
                  <th className="p-2 font-bold bg-muted/50 border-r border-border text-center w-10">
                    #
                  </th>
                  {queryData.columns.map((col, colIdx) => (
                    <th
                      key={col}
                      className="p-2 font-bold bg-muted/50 truncate border-r border-border last:border-0 relative select-none cursor-pointer hover:bg-muted/70 transition-colors group"
                      style={{ width: columnWidths[col] ?? DEFAULT_COL_WIDTH, minWidth: 80, maxWidth: 600 }}
                      title={col}
                      onClick={() => handleSortToggle(col)}
                    >
                      <div className="flex items-center gap-1 pr-4">
                        <span className="flex flex-col min-w-0">
                          <span className="truncate leading-tight">{col}</span>
                          {columnTypeDisplay(col, colIdx) && (
                            <span className="text-[10px] font-normal text-muted-foreground/70 truncate leading-tight">
                              {columnTypeDisplay(col, colIdx)}
                            </span>
                          )}
                        </span>
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
                    className={cn(
                      "whitespace-nowrap",
                      selectedRowIndexes.has(i)
                        ? 'bg-primary/10'
                        : 'border-b border-border/50 hover:bg-muted/30'
                    )}
                    onClick={(e) => { e.stopPropagation(); handleRowClick(e, i); }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.pageX, y: e.pageY, row, rowIndex: i });
                    }}
                  >
                    <td className="p-2 border-r border-border text-center text-muted-foreground select-none cursor-pointer">
                      <span
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          toggleRowSelection(i);
                        }}
                        title="Double-click to select row"
                      >
                        {i + 1}
                      </span>
                    </td>
                    {queryData.columns.map((col) => {
                      const value = row[col];
                      const isSelectedCell = selectedCell?.rowIndex === i && selectedCell?.column === col;
                      return (
                        <td
                          key={col}
                          ref={editingCell?.rowIndex === i && editingCell?.column === col ? editingCellRef : undefined}
                          className={cn(
                            "p-2 border-r border-border last:border-0 truncate cursor-text relative group/cell",
                            isSelectedCell && "ring-1 ring-primary/50 bg-primary/5"
                          )}
                          style={{ width: columnWidths[col] ?? DEFAULT_COL_WIDTH, minWidth: 80, maxWidth: 600 }}
                          onClick={(e) => { e.stopPropagation(); setSelectedCell({ rowIndex: i, column: col }); }}
                          onDoubleClick={() => handleStartEdit(i, col, value)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({
                              x: e.pageX,
                              y: e.pageY,
                              row,
                              rowIndex: i,
                              column: col,
                              dateTime: isDateTimeColumn(col),
                            });
                          }}
                          title="Double-click to edit"
                        >
                          {editingCell?.rowIndex === i &&
                          editingCell?.column === col ? (
                            <div
                              className="flex items-center gap-1 bg-background"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {enumValuesFor(col).length > 0 ? (
                                <select
                                  autoFocus
                                  className="w-full bg-muted border border-border px-1 py-0.5 rounded outline-none text-xs"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => onInputKeyDown(e, row)}
                                >
                                  <option value="">NULL</option>
                                  {[editValue, ...enumValuesFor(col)]
                                    .filter((v, idx, arr) => v !== '' && arr.indexOf(v) === idx)
                                    .map((v) => (
                                      <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                              ) : isBooleanColumn(col) ? (
                                (() => {
                                  const repr = booleanRepr(col);
                                  const isOn = editValue === repr.on;
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditValue(isOn ? repr.off : repr.on);
                                      }}
                                      className={cn(
                                        "relative inline-flex items-center h-5 w-9 rounded-full transition-colors cursor-pointer shrink-0",
                                        isOn ? "bg-primary" : "bg-muted"
                                      )}
                                      title={isOn ? repr.on : repr.off}
                                    >
                                      <span
                                        className={cn(
                                          "inline-block w-3.5 h-3.5 bg-background rounded-full transition-transform",
                                          isOn ? "translate-x-[18px]" : "translate-x-0.5"
                                        )}
                                      />
                                    </button>
                                  );
                                })()
                              ) : (
                                <input
                                  autoFocus
                                  className="w-full bg-muted border border-border px-1 py-0.5 rounded outline-none"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => onInputKeyDown(e, row)}
                                />
                              )}
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
                                  <span className="text-muted-foreground italic text-[var(--ch-text-10)]">NULL</span>
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
          )
        ) : (
          executionStatus === ExecutionStatus.SUCCESS && (
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
                <span className="text-[var(--ch-text-10)] text-muted-foreground font-black uppercase tracking-widest opacity-70">
                  Rows:
                </span>
                <div className="relative flex items-center group/select">
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="appearance-none text-[var(--ch-text-10)] bg-muted/30 border border-border/50 rounded-md pl-3 pr-8 py-1.5 outline-none font-black text-foreground transition-all hover:border-primary/40 hover:bg-muted/60 cursor-pointer shadow-inner"
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
                  <span className="text-[var(--ch-text-10)] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full">
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

      {/* Phase 9: Visual Diff Panel for cell edits — positioned near the edited cell */}
      {pendingEdit && reviewPos && (
        <ReviewChangePanel
          column={pendingEdit.column}
          prevValue={pendingEdit.prevValue}
          nextValue={pendingEdit.nextValue}
          onConfirm={confirmPendingEdit}
          onDiscard={discardPendingEdit}
          position={reviewPos}
        />
      )}

      {/* Batch action modal: UPDATE / SET NULL for the selected rows */}
      {batchModal && queryData && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40"
          onClick={() => setBatchModal(null)}
        >
          <div
            className="bg-card border border-border/60 rounded-xl shadow-2xl shadow-black/50 w-[440px] max-h-[80vh] overflow-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold flex items-center gap-2">
                {batchModal === 'update' ? (
                  <><PenLine className="w-4 h-4 text-primary" /> Update {selectedRows.length} selected row{selectedRows.length > 1 ? 's' : ''}</>
                ) : (
                  <><Eraser className="w-4 h-4 text-primary" /> Set fields to NULL ({selectedRows.length} row{selectedRows.length > 1 ? 's' : ''})</>
                )}
              </h4>
              <button
                onClick={() => setBatchModal(null)}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {batchModal === 'update' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[var(--ch-text-10)] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                    Column
                  </label>
                  <select
                    value={batchColumn}
                    onChange={(e) => setBatchColumn(e.target.value)}
                    className="w-full bg-muted/30 border border-border/50 rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select a column...</option>
                    {queryData.columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[var(--ch-text-10)] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                    Value
                  </label>
                  <input
                    value={batchValue}
                    onChange={(e) => setBatchValue(e.target.value)}
                    placeholder="New value (empty = NULL)"
                    className="w-full bg-muted/30 border border-border/50 rounded-md px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <button
                  onClick={handleBatchUpdate}
                  disabled={!batchColumn}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  Generate SQL
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  The selected fields will be set to <span className="font-mono font-bold text-foreground">NULL</span> on all selected rows.
                </p>
                <div className="grid grid-cols-2 gap-1 max-h-56 overflow-auto">
                  {queryData.columns
                    .filter((c) => !primaryKeys.includes(c))
                    .map((c) => (
                      <label
                        key={c}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={truncateColumns.includes(c)}
                          onChange={(e) => {
                            setTruncateColumns((prev) =>
                              e.target.checked
                                ? [...prev, c]
                                : prev.filter((x) => x !== c)
                            );
                          }}
                          className="accent-[var(--ch-primary)] cursor-pointer"
                        />
                        <span className="truncate">{c}</span>
                      </label>
                    ))}
                </div>
                <button
                  onClick={handleBatchTruncate}
                  disabled={truncateColumns.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  Generate SQL
                </button>
              </div>
            )}
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
