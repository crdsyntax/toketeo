import { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Clock, Save, Maximize2, Download, ChevronUp, ChevronDown, Table2, AlertCircle, X, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, FileJson, FileText } from 'lucide-react'
import { cn, downloadCSV } from '@/lib/utils'
import type { QueryTab } from '@/store/useAppStore'
import type { DbRow, DbValue } from '@/types/database'
import { ExecutionStatus } from '@/types/database'
import { invoke } from '@tauri-apps/api/core'

const LIMIT_OPTIONS = [
  { label: '100 rows', value: 100 },
  { label: '500 rows', value: 500 },
  { label: '1 000 rows', value: 1000 },
  { label: '5 000 rows', value: 5000 },
  { label: 'No limit', value: 0 },
]

interface ResultsPanelProps {
  activeTab: QueryTab | null
  panels: { editor: boolean; results: boolean }
  togglePanel: (panel: 'editor' | 'results') => void
  editingCell: { rowIndex: number; column: string; value: DbValue } | null
  setEditingCell: (cell: { rowIndex: number; column: string; value: DbValue } | null) => void
  handleSave: () => void
  setShowResultModal: (show: boolean) => void
  requestSort: (key: string) => void
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null
  sortedRows: DbRow[]
  updateTabResults: (tabId: string, updates: Partial<QueryTab>) => void
  handlePageChange: (page: number) => void
  setContextMenuSql: (menu: { x: number, y: number, row: DbRow } | null) => void
  queryLimit: number
  setQueryLimit: (limit: number) => void
}

export function ResultsPanel({
  activeTab, panels, togglePanel, editingCell, setEditingCell,
  handleSave, setShowResultModal, requestSort, sortConfig,
  sortedRows, updateTabResults, handlePageChange, setContextMenuSql,
  queryLimit, setQueryLimit,
}: ResultsPanelProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showLimitMenu, setShowLimitMenu] = useState(false);

  // eslint-disable-next-line react-hooks/incompatible-library -- @tanstack/virtual is not yet React Compiler compatible; warning is expected
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const isResultsPanelVisible = panels?.results ?? false;

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start || 0 : 0;
  const paddingBottom = virtualItems.length > 0
    ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end || 0)
    : 0;

  const handleExportJSON = async () => {
    if (!activeTab?.results) return;
    setShowExportMenu(false);
    const content = JSON.stringify(sortedRows, null, 2);
    try {
      await invoke('save_file_dialog', {
        content,
        defaultFileName: `${activeTab.name}-results.json`,
        filterName: 'JSON Files',
        filterExt: 'json',
      });
    } catch (e) {
      console.error('Failed to export JSON:', e);
    }
  };

  const handleExportCSV = async () => {
    if (!activeTab?.results) return;
    setShowExportMenu(false);
    await downloadCSV(sortedRows, activeTab.results.columns, `${activeTab.name}-results.csv`);
  };

  const currentLimitLabel = LIMIT_OPTIONS.find(o => o.value === queryLimit)?.label ?? `${queryLimit} rows`;

  return (
    <div
      className={cn(
        "border border-border/80 rounded-xl bg-card flex flex-col transition-all duration-300 shadow-sm",
        isResultsPanelVisible ? "flex-1 min-h-[150px] overflow-hidden" : "h-11 shrink-0 overflow-visible"
      )}
      onClick={() => { setShowExportMenu(false); setShowLimitMenu(false); }}
    >
      {/* Panel Header Principal — overflow:visible para que los dropdowns salgan */}
      <div className="h-11 border-b border-border bg-muted/40 flex justify-between items-center px-4 select-none shrink-0 relative overflow-visible" style={{ zIndex: 40 }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => togglePanel('results')}
            className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md transition-colors"
          >
            {isResultsPanelVisible ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
            <Table2 className="w-4 h-4 text-muted-foreground" />
            <span>Results</span>
            {activeTab?.status === ExecutionStatus.EXECUTING && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary animate-pulse ml-1">
                <span className="w-1 h-1 rounded-full bg-primary" />
                Executing...
              </span>
            )}
          </h3>
        </div>

        {activeTab?.results && isResultsPanelVisible && (
          <div className="flex items-center gap-2">
            {/* Selector de límite */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowLimitMenu(v => !v); setShowExportMenu(false); }}
                className="flex items-center gap-1 text-[10px] font-mono font-bold text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted px-2 py-1 rounded-md border border-border/40 transition-colors"
              >
                {currentLimitLabel}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showLimitMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-1 min-w-[130px] rounded-lg border border-border shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-100"
                  style={{ zIndex: 9999, background: 'hsl(var(--card))' }}
                >
                  {LIMIT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setQueryLimit(opt.value); setShowLimitMenu(false); }}
                      className={cn(
                        "w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors",
                        queryLimit === opt.value
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {activeTab.results.page !== undefined && (
              <div className="flex items-center gap-1 bg-muted/30 px-1 py-0.5 rounded-md border border-border/40">
                <button
                  disabled={activeTab.results.page <= 1 || activeTab.status === ExecutionStatus.EXECUTING}
                  onClick={() => handlePageChange(activeTab.results!.page! - 1)}
                  className="p-1 hover:bg-muted text-muted-foreground rounded disabled:opacity-30 transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono font-bold mx-1 text-muted-foreground">
                  PAGE {activeTab.results.page}
                </span>
                <button
                  disabled={!activeTab.results.hasMore || activeTab.status === ExecutionStatus.EXECUTING}
                  onClick={() => handlePageChange(activeTab.results!.page! + 1)}
                  className="p-1 hover:bg-muted text-muted-foreground rounded disabled:opacity-30 transition-colors"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-muted/60 px-2 py-1 rounded-md border border-border/40">
              <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
              {activeTab.results.executionTime}ms
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-muted/60 px-2 py-1 rounded-md border border-border/40">
              <span className="font-bold text-foreground">{sortedRows.length}</span>
              &nbsp;rows
            </div>

            <div className="h-4 w-[1px] bg-border mx-1" />

            <div className="flex items-center gap-1">
              {editingCell && (
                <button
                  onClick={handleSave}
                  className="text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-sm transition-colors mr-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  Apply Changes
                </button>
              )}
              <button
                onClick={() => setShowResultModal(true)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Fullscreen
              </button>

              {/* Export dropdown */}
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowExportMenu(v => !v); setShowLimitMenu(false); }}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showExportMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-1 min-w-[150px] rounded-lg border border-border shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-100"
                    style={{ zIndex: 9999, background: 'hsl(var(--card))' }}
                  >
                    <button
                      onClick={() => void handleExportCSV()}
                      className="w-full text-left text-xs px-2.5 py-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-2"
                    >
                      <FileText className="w-3.5 h-3.5 text-green-500" />
                      Export as CSV
                    </button>
                    <button
                      onClick={() => void handleExportJSON()}
                      className="w-full text-left text-xs px-2.5 py-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-2"
                    >
                      <FileJson className="w-3.5 h-3.5 text-yellow-500" />
                      Export as JSON
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Contenedor del contenido */}
      {isResultsPanelVisible && (
        <div className="flex-1 flex flex-col overflow-hidden bg-background relative min-h-0">

          {/* Error Alert */}
          {activeTab?.status === ExecutionStatus.ERROR && (
            <div className="absolute top-0 left-0 right-0 p-3 bg-destructive/10 border-b border-destructive/20 text-destructive flex items-start gap-2.5 m-3 rounded-lg z-30 animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-md">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-1">
                <p className="text-xs font-semibold leading-none">Query Execution Failed</p>
                <p className="text-xs font-mono opacity-90 break-all">{activeTab.error}</p>
              </div>
              <button
                onClick={() => updateTabResults(activeTab.id, { status: ExecutionStatus.IDLE, error: null })}
                className="p-1 hover:bg-destructive/20 rounded-md text-destructive/80 hover:text-destructive transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Tabla Virtualizada */}
          {activeTab?.results && sortedRows.length > 0 ? (
            <div ref={parentRef} className="flex-1 overflow-auto relative h-full" onClick={() => { setShowExportMenu(false); setShowLimitMenu(false); }}>
              <table className="w-max min-w-full border-collapse table-fixed text-sm">

                {/* THEAD Fijo */}
                <thead className="sticky top-0 z-20 bg-muted shadow-[0_1px_0_0_hsl(var(--border))]">
                  <tr>
                    <th className="p-2.5 font-semibold text-muted-foreground text-xs border-r border-border/60 w-12 min-w-[3rem] max-w-[3rem] text-center shrink-0 bg-muted select-none">
                      #
                    </th>
                    {activeTab.results.columns.map((col: string) => {
                      const isSorted = sortConfig?.key === col;
                      return (
                        <th
                          key={col}
                          onClick={() => requestSort(col)}
                          className="p-2.5 font-semibold text-muted-foreground text-xs border-r border-border/60 w-[250px] max-w-[250px] bg-muted cursor-pointer hover:bg-muted-foreground/10 hover:text-foreground transition-colors select-none"
                        >
                          <div className="flex items-center justify-between group">
                            <span className="truncate font-mono">{col}</span>
                            <div className={cn(
                              "p-1 rounded-md transition-colors",
                              isSorted ? "bg-primary/10 text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground group-hover:bg-background"
                            )}>
                              {isSorted ? (
                                sortConfig?.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                              ) : <ArrowUpDown className="w-3 h-3" />}
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* TBODY Virtualizado */}
                <tbody className="divide-y divide-border/40">

                  {paddingTop > 0 && (
                    <tr>
                      <td style={{ padding: 0, border: 0 }} colSpan={activeTab.results.columns.length + 1}>
                        <div style={{ height: `${paddingTop}px` }} />
                      </td>
                    </tr>
                  )}

                  {virtualItems.map((virtualRow) => {
                    const row = sortedRows[virtualRow.index];
                    const i = virtualRow.index;
                    const isSelected = i === selectedRowIndex;

                    return (
                      <tr
                        key={virtualRow.key}
                        ref={rowVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        className={cn(
                          "transition-colors duration-150 group h-9",
                          isSelected ? 'bg-primary/5 hover:bg-primary/5' : 'hover:bg-muted/20'
                        )}
                        onClick={() => setSelectedRowIndex(i)}
                        onDoubleClick={() => setSelectedRowIndex(i)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenuSql({ x: e.pageX, y: e.pageY, row });
                        }}
                      >
                        <td className={cn(
                          "p-2.5 border-r border-border/60 text-center text-xs font-mono w-12 min-w-[3rem] cursor-pointer select-none transition-colors",
                          isSelected ? "text-primary font-bold bg-primary/5" : "text-muted-foreground/60 bg-muted/10 group-hover:bg-transparent"
                        )}>
                          {i + 1}
                        </td>

                        {activeTab.results!.columns.map((col: string) => {
                          const isEditing = editingCell?.rowIndex === i && editingCell?.column === col;
                          const isNull = row[col] === null;

                          return (
                            <td
                              key={col}
                              onDoubleClick={() => {
                                setSelectedRowIndex(i);
                                setEditingCell({ rowIndex: i, column: col, value: row[col] });
                              }}
                              className={cn(
                                "border-r border-border/40 truncate relative font-mono text-xs text-foreground/90 w-[250px] max-w-[250px] cursor-pointer",
                                isEditing ? "p-0" : "p-2.5"
                              )}
                            >
                              {isEditing ? (
                                <input
                                  autoFocus
                                  className="absolute inset-0 w-full h-full bg-background border-2 border-primary outline-none px-2.5 font-mono text-xs z-20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]"
                                  value={typeof editingCell.value === 'boolean' ? String(editingCell.value) : (editingCell.value ?? '')}
                                  onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleSave();
                                    }
                                    if (e.key === 'Escape') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setEditingCell(null);
                                    }
                                  }}
                                />
                              ) : (
                                isNull ? (
                                  <span className="inline-block bg-muted/60 border border-border/80 rounded-[4px] px-1.5 py-0.5 text-[10px] text-muted-foreground/70 italic select-none">
                                    NULL
                                  </span>
                                ) : (
                                  typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col])
                                )
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {paddingBottom > 0 && (
                    <tr>
                      <td style={{ padding: 0, border: 0 }} colSpan={activeTab.results.columns.length + 1}>
                        <div style={{ height: `${paddingBottom}px` }} />
                      </td>
                    </tr>
                  )}

                </tbody>
              </table>
            </div>

          ) : activeTab?.status !== ExecutionStatus.EXECUTING && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2 select-none animate-in fade-in duration-200">
              <Table2 className="w-8 h-8 opacity-20" />
              <span className="text-xs italic">No data rows returned or empty dataset</span>
            </div>
          )}

          {/* Skeleton Loader */}
          {activeTab?.status === ExecutionStatus.EXECUTING && (
            <div className="flex-1 overflow-hidden pointer-events-none animate-in fade-in duration-150">
              <table className="w-full border-collapse table-fixed text-sm">
                <thead className="bg-muted shadow-[0_1px_0_0_hsl(var(--border))]">
                  <tr>
                    <th className="w-12 h-10 border-r border-border/60 bg-muted"></th>
                    {[1, 2, 3].map(i => (
                      <th key={i} className="p-2.5 text-left border-r border-border/60 w-[250px]">
                        <div className="h-4 w-32 bg-muted-foreground/10 rounded" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {[1, 2, 3, 4, 5].map(rowIdx => (
                    <tr key={rowIdx} className="bg-background/50 h-9">
                      <td className="w-12 border-r border-border/60 bg-muted/10"></td>
                      <td className="p-2.5 border-r border-border/40">
                        <div className="h-3 w-40 bg-muted rounded animate-pulse" style={{ animationDelay: `${rowIdx * 75}ms` }} />
                      </td>
                      <td className="p-2.5 border-r border-border/40">
                        <div className="h-3 w-24 bg-muted rounded animate-pulse hidden md:block" style={{ animationDelay: `${rowIdx * 100}ms` }} />
                      </td>
                      <td className="p-2.5 border-r border-border/40">
                        <div className="h-3 w-52 bg-muted rounded animate-pulse hidden lg:block" style={{ animationDelay: `${rowIdx * 125}ms` }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}
    </div>
  )
}