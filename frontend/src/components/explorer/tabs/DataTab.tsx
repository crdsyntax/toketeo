import { Loader2, AlertCircle, ChevronLeft, ChevronRight as ChevronRightIcon, Layout, Code, Play, Check, X, Undo, Redo } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import type { QueryResult, ExecutionStatus, DatabaseObject, DbRow, DbValue } from '@/types/database';
import { SqlGeneratorModal } from '../../query/SqlGeneratorModal';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/store/useAppStore';

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
  setFilter
}: DataTabProps) {
  const [editingCell, setEditingCell] = useState<{ rowIndex: number, column: string } | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  
  // Historial para Undo/Redo
  const [history, setHistory] = useState<{ row: DbRow, col: string, prev: DbValue, next: DbValue }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, row: DbRow } | null>(null);
  const [sqlModal, setSqlModal] = useState<{ isOpen: boolean, sql: string }>({ isOpen: false, sql: '' });
  const activeConnection = useAppStore(state => state.activeConnection);

  const handleStartEdit = (rowIndex: number, column: string, value: DbValue) => {
    if (selectedItem.type !== 'table') return; // Only tables are editable for now
    setEditingCell({ rowIndex, column });
    setEditValue(value === null ? '' : String(value));
  };

  const handleSaveEdit = (row: DbRow) => {
    if (!editingCell) return;
    
    const prevValue = row[editingCell.column];
    updateCell(row, editingCell.column, editValue);
    
    // Guardar en historial
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ row, col: editingCell.column, prev: prevValue, next: editValue });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);

    setEditingCell(null);
  };

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
        if (e.shiftKey) redo(); else undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
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

  const handleGenerateSql = async (action: string) => {
    if (!contextMenu || !activeConnection || !queryData) return;
    
    const pks = queryData.primary_keys || [];
    const primary_keys = pks.reduce((acc, pk) => {
      if (contextMenu.row[pk] !== undefined) acc[pk] = contextMenu.row[pk];
      return acc;
    }, {} as Record<string, DbValue>);

    try {
      const sql = await invoke<string>('generate_sql', {
        id: activeConnection.id,
        action,
        context: {
          table: selectedItem.name,
          primary_keys,
          data: contextMenu.row
        }
      });
      setSqlModal({ isOpen: true, sql });
    } catch (e) {
      console.error('Failed to generate SQL:', e);
    } finally {
      setContextMenu(null);
    }
  };

  if ((selectedItem.type === 'view' || selectedItem.type === 'procedure') && executionStatus === 'idle') {
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
    <div className="flex-1 flex flex-col min-h-0 min-w-0" onClick={() => setContextMenu(null)}>
      <SqlGeneratorModal 
        isOpen={sqlModal.isOpen} 
        onClose={() => setSqlModal({ isOpen: false, sql: '' })} 
        initialSql={sqlModal.sql} 
      />

      {contextMenu && (
        <div 
          className="fixed z-[200] bg-popover border border-border rounded-md shadow-lg py-1 min-w-[150px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {['SELECT', 'UPDATE', 'INSERT', 'DELETE'].map(action => (
            <button 
              key={action}
              onClick={() => handleGenerateSql(action.toLowerCase())}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted"
            >
              Generate {action}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-2 border-b border-border bg-muted/5 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
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
           <div className="flex items-center gap-1 border-l pl-2">
             <button onClick={undo} disabled={historyIndex < 0} className="p-1 hover:bg-muted rounded disabled:opacity-50" title="Undo"><Undo className="w-3.5 h-3.5"/></button>
             <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1 hover:bg-muted rounded disabled:opacity-50" title="Redo"><Redo className="w-3.5 h-3.5"/></button>
           </div>
        </div>
      </div>
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
            <table className="min-w-full text-left text-xs border-collapse table-auto">
              <thead className="sticky top-0 bg-background border-b border-border z-10">
                <tr>
                  <th className="p-2 font-bold bg-muted/50 border-r border-border text-center w-10">#</th>
                  {queryData.columns.map((col) => (
                    <th
                      key={col}
                      className="p-2 font-bold bg-muted/50 truncate border-r border-border last:border-0 max-w-[200px]"
                      title={col}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queryData.rows.map((row, i) => (
                  <tr 
                    key={i} 
                    className={`${i === selectedRowIndex ? 'bg-muted' : 'border-b border-border/50 hover:bg-muted/30'} whitespace-nowrap`}
                    onClick={() => setSelectedRowIndex(i)}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({x: e.pageX, y: e.pageY, row}); }}
                  >
                    <td className="p-2 border-r border-border text-center text-muted-foreground font-mono">{i + 1}</td>
                    {queryData.columns.map((col) => {
                      const value = row[col];
                      return (
                      <td 
                        key={col} 
                        className="p-2 border-r border-border last:border-0 truncate max-w-[200px] cursor-text relative"
                        onDoubleClick={() => handleStartEdit(i, col, value)}
                        title="Double-click to edit"
                      >
                        {editingCell?.rowIndex === i && editingCell?.column === col ? (
                          <div className="flex items-center gap-1 bg-background" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              className="w-full bg-muted border border-border px-1 py-0.5 rounded outline-none"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => onInputKeyDown(e, row)}
                            />
                            <button 
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleSaveEdit(row); }} 
                              className="text-primary hover:text-primary/80 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditingCell(null); }} 
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            {value === null ? (
                              <span className="text-muted-foreground italic text-[10px]">NULL</span>
                            ) : (
                              String(value)
                            )}
                          </>
                        )}
                      </td>
                    )})}
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
      {queryData && (selectedItem.type === 'table' || selectedItem.type === 'view') && (
        <div className="p-3 border-t border-border flex items-center justify-between bg-muted/10">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              Rows: <span className="font-bold text-foreground">{queryData.rows.length}</span>
            </span>
            <span>
              Execution: <span className="font-bold text-foreground">{queryData.executionTime}ms</span>
            </span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-70">Rows:</span>
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
    </div>
  );
}
