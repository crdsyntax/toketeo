import { ChevronUp, ChevronDown, Table2, Clock, Save, Maximize2, Download, AlertCircle, X, ArrowUp, ArrowDown, ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QueryTab, DbValue } from '@/store/useAppStore';
import type { DbRow } from '@/types/database';

interface ResultsPanelProps {
  activeTab: QueryTab;
  isVisible: boolean;
  onToggle: () => void;
  updateTabResults: (id: string, results: Partial<QueryTab>) => void;
  handleSave: () => void;
  setShowResultModal: (show: boolean) => void;
  sortConfig: { key: string, direction: 'asc' | 'desc' } | null;
  requestSort: (key: string) => void;
  sortedRows: DbRow[];
  editingCell: { rowIndex: number; column: string; value: DbValue } | null;
  setEditingCell: (cell: { rowIndex: number; column: string; value: DbValue } | null) => void;
  handlePageChange: (page: number) => void;
  clearResults: () => void;
}

export function ResultsPanel({
  activeTab,
  isVisible,
  onToggle,
  updateTabResults,
  handleSave,
  setShowResultModal,
  sortConfig,
  requestSort,
  sortedRows,
  editingCell,
  setEditingCell,
  handlePageChange,
  clearResults,
}: ResultsPanelProps) {
  return (
    <div className={cn("border border-border rounded-none bg-card flex flex-col overflow-hidden transition-all duration-300", isVisible ? "flex-1 min-h-[150px]" : "h-10 shrink-0")}>
      <div className="p-2 border-b border-border bg-muted/20 flex justify-between items-center px-4 text-left">
        <div className="flex items-center gap-2">
          <button onClick={onToggle} className="p-1 hover:bg-muted rounded">
            {isVisible ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Table2 className="w-3 h-3" />
            Results {activeTab.status === 'executing' && <span className="animate-pulse text-primary ml-2">Executing...</span>}
          </h3>
        </div>
        {activeTab.results && isVisible && (
          <div className="flex items-center gap-4">
            {activeTab.results.page !== undefined && (
              <div className="flex items-center gap-1 border-r border-border pr-4 mr-2">
                <button 
                  disabled={activeTab.results.page <= 1 || activeTab.status === 'executing'}
                  onClick={() => handlePageChange(activeTab.results!.page! - 1)}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono font-bold mx-1">
                  PAGE {activeTab.results.page}
                </span>
                <button 
                  disabled={!activeTab.results.hasMore || activeTab.status === 'executing'}
                  onClick={() => handlePageChange(activeTab.results!.page! + 1)}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground border-r border-border pr-4 mr-2">
              <Clock className="w-3 h-3" />
              {activeTab.results.executionTime}ms
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              Rows: <span className="font-bold text-foreground">{activeTab.results.rows.length}</span>
            </div>
            <div className="flex items-center gap-2 ml-4 border-l border-border pl-4">
              {editingCell && (
                <button 
                  onClick={handleSave} 
                  className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 mr-2 animate-pulse"
                >
                  <Save className="w-3 h-3" />
                  Save Changes
                </button>
              )}
              <button 
                onClick={() => setShowResultModal(true)} 
                className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 mr-2"
              >
                <Maximize2 className="w-3 h-3" />
                Full Screen
              </button>
              <button 
                onClick={clearResults}
                className="text-[10px] font-bold text-muted-foreground hover:text-destructive flex items-center gap-1 mr-2"
                title="Clear Results"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
              <button className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Download className="w-3 h-3" />
                CSV
              </button>
            </div>
          </div>
        )}
      </div>
      {isVisible && (
        <div className="flex-1 overflow-auto">
          {activeTab.status === 'error' && (
            <div className="p-4 bg-destructive/10 border-b border-destructive/20 text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <p className="text-xs font-mono">{activeTab.error}</p>
              <button 
                onClick={() => updateTabResults(activeTab.id, { status: 'idle', error: null })} 
                className="ml-auto p-1 hover:bg-destructive/20 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {activeTab.status === 'success' && activeTab.results && activeTab.results.rows.length === 0 && (
            <div className="p-8 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center text-green-500">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Query Executed Successfully</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeTab.results.message || 'The command completed without returning a result set.'}
                </p>
                {activeTab.results.affectedRows !== undefined && (
                  <div className="mt-4 inline-block px-3 py-1 bg-muted rounded-none border border-border text-[10px] font-mono font-bold uppercase tracking-wider">
                    Rows Affected: {activeTab.results.affectedRows}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab.results && activeTab.results.rows.length > 0 ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-background border-b border-border z-10 shadow-sm">
                <tr>
                  {activeTab.results.columns.map((col: string) => (
                    <th key={col} onClick={() => requestSort(col)} className="p-2 font-bold bg-muted/50 border-r border-border cursor-pointer hover:bg-muted transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{col}</span>
                        {sortConfig?.key === col ? (
                          sortConfig?.direction === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-primary" /> : <ArrowDown className="w-2.5 h-2.5 text-primary" />
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 opacity-20" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 whitespace-nowrap">
                    {activeTab.results!.columns.map((col: string) => (
                      <td 
                        key={col} 
                        onDoubleClick={() => setEditingCell({ rowIndex: i, column: col, value: row[col] })} 
                        className="p-2 border-r border-border last:border-0 truncate max-w-[250px] relative group"
                      >
                        {editingCell?.rowIndex === i && editingCell?.column === col ? (
                          <input 
                            autoFocus
                            className="absolute inset-0 w-full h-full bg-background border-2 border-primary outline-none px-2 z-20"
                            value={typeof editingCell.value === 'boolean' ? String(editingCell.value) : (editingCell.value ?? '')}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSave();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                          />
                        ) : (
                          row[col] === null ? <span className="text-muted-foreground italic text-[10px]">NULL</span> : String(row[col])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            activeTab.status === 'idle' && (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic text-center p-8">
                Run a query to see results
              </div>
            )
          )}
          {activeTab.status === 'executing' && (
            <div className="p-4 space-y-4 text-left">
              {[1, 2, 3].map(i => <div key={i} className="h-6 bg-muted animate-pulse rounded-none" />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
