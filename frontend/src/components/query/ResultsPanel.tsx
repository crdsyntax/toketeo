import { Clock, Save, Maximize2, Download, ChevronUp, ChevronDown, Table2, AlertCircle, X, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tab } from '@/store/useAppStore'
import type { DbRow, DbValue } from '@/types/database'

interface ResultsPanelProps {
  activeTab: Tab | null
  panels: { editor: boolean; results: boolean }
  togglePanel: (panel: 'editor' | 'results') => void
  editingCell: { rowIndex: number; column: string; value: DbValue } | null
  setEditingCell: (cell: { rowIndex: number; column: string; value: DbValue } | null) => void
  handleSave: () => void
  setShowResultModal: (show: boolean) => void
  requestSort: (key: string) => void
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null
  sortedRows: DbRow[]
  updateTabResults: (tabId: string, updates: Partial<Tab>) => void
}

export function ResultsPanel({
  activeTab, panels, togglePanel, editingCell, setEditingCell,
  handleSave, setShowResultModal, requestSort, sortConfig,
  sortedRows, updateTabResults
}: ResultsPanelProps) {
  return (
    <div className={cn(
      "border border-border rounded-xl bg-card flex flex-col overflow-hidden transition-all duration-300",
      panels.results ? "flex-1 min-h-[150px]" : "h-10 shrink-0"
    )}>
      <div className="p-2 border-b border-border bg-muted/20 flex justify-between items-center px-4">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => togglePanel('results')}
            className="p-1 hover:bg-muted rounded"
          >
            {panels.results ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Table2 className="w-3 h-3" />
            Results {activeTab?.status === 'executing' && <span className="animate-pulse text-primary ml-2">Processing...</span>}
          </h3>
        </div>
        
        {activeTab?.results && panels.results && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {activeTab.results.executionTime}ms
            </div>
            <div className="flex items-center gap-2 ml-4 border-l border-border pl-4 text-left">
              {editingCell && (
                <button 
                  onClick={handleSave}
                  className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 mr-2 animate-pulse"
                >
                  <Save className="w-3 h-3" />
                  Apply
                </button>
              )}
              <button 
                onClick={() => setShowResultModal(true)}
                className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 mr-2"
              >
                <Maximize2 className="w-3 h-3" />
                Fullscreen
              </button>
              <button className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Download className="w-3 h-3" />
                Export
              </button>
            </div>
          </div>
        )}
      </div>

      {panels.results && (
        <div className="flex-1 overflow-auto text-left">
          {activeTab?.status === 'error' && (
            <div className="p-4 bg-destructive/10 border-b border-destructive/20 text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <p className="text-xs font-mono">{activeTab.error}</p>
              <button onClick={() => updateTabResults(activeTab.id, { status: 'idle', error: null })} className="ml-auto p-1 hover:bg-destructive/20 rounded">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {activeTab?.results ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-background border-b border-border z-10 shadow-sm">
                <tr>
                  {activeTab.results.columns.map((col: string) => (
                    <th 
                      key={col} 
                      onClick={() => requestSort(col)}
                      className="p-2 font-bold bg-muted/50 border-r border-border cursor-pointer hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{col}</span>
                        {sortConfig?.key === col ? (
                          sortConfig.direction === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-primary" /> : <ArrowDown className="w-2.5 h-2.5 text-primary" />
                        ) : <ArrowUpDown className="w-2.5 h-2.5 opacity-20" />}
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

          ) : activeTab?.status !== 'executing' && (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">
              Processing...
            </div>
          )}

          {activeTab?.status === 'executing' && (
            <div className="p-4 space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-6 bg-muted animate-pulse rounded" />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
