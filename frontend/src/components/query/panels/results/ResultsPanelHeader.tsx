import { Clock, Save, Maximize2, Download, ChevronUp, ChevronDown, Table2, ChevronLeft, ChevronRight, FileJson, FileText, BarChart3 } from 'lucide-react';
import { cn, downloadCSV } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import type { QueryTab } from '@/store/useAppStore';
import { ExecutionStatus } from '@/types/database';
import type { DbRow, DbValue } from '@/types/database';
import { invoke } from '@tauri-apps/api/core';
import { useGamificationStore } from '@/store/gamificationStore';

interface ResultsPanelHeaderProps {
  activeTab: QueryTab | null;
  isResultsPanelVisible: boolean;
  togglePanel: (panel: 'editor' | 'results') => void;
  queryLimit: number;
  setQueryLimit: (limit: number) => void;
  handlePageChange: (page: number) => void;
  sortedRows: DbRow[];
  editingCell: { rowIndex: number; column: string; value: DbValue } | null;
  handleSave: () => void;
  setShowResultModal: (show: boolean) => void;
  viewMode: 'table' | 'json' | 'visualize';
  setViewMode: (mode: 'table' | 'json' | 'visualize') => void;
  showExportMenu: boolean;
  setShowExportMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showLimitMenu: boolean;
  setShowLimitMenu: React.Dispatch<React.SetStateAction<boolean>>;
  LIMIT_OPTIONS: { label: string, value: number }[];
}

export function ResultsPanelHeader({
  activeTab,
  isResultsPanelVisible,
  togglePanel,
  queryLimit,
  setQueryLimit,
  handlePageChange,
  sortedRows,
  editingCell,
  handleSave,
  setShowResultModal,
  viewMode,
  setViewMode,
  showExportMenu,
  setShowExportMenu,
  showLimitMenu,
  setShowLimitMenu,
  LIMIT_OPTIONS
}: ResultsPanelHeaderProps) {
  const currentLimitLabel = LIMIT_OPTIONS.find(o => o.value === queryLimit)?.label ?? `${queryLimit} rows`;

  const editorFontFamily = useAppStore((s) => s.editorFontFamily);

  const { trackAction, addXP } = useGamificationStore();

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
      addXP(25); // XP for export
      trackAction('EXPORT_DATA');
    } catch (e) {
      console.error('Failed to export JSON:', e);
    }
  };

  const handleExportCSV = async () => {
    if (!activeTab?.results) return;
    setShowExportMenu(false);
    await downloadCSV(sortedRows, activeTab.results.columns, `${activeTab.name}-results.csv`);
    addXP(25); // XP for export
    trackAction('EXPORT_DATA');
  };

  return (
    <div className="h-9 border-b border-border bg-background/80 backdrop-blur flex justify-between items-center px-3 select-none shrink-0 relative overflow-visible" style={{ zIndex: 40 }}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => togglePanel('results')}
          className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors"
        >
          {isResultsPanelVisible ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Table2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span>Query Result Grid</span>
          {activeTab?.results && isResultsPanelVisible && (
            <span className="font-normal text-muted-foreground">
              ({sortedRows.length} rows returned)
            </span>
          )}
          {activeTab?.status === ExecutionStatus.EXECUTING && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[var(--ch-text-9)] font-medium bg-primary/10 text-primary animate-pulse">
              <span className="w-1 h-1 rounded-full bg-primary" />
              Running...
            </span>
          )}
        </h3>
      </div>

      {activeTab?.results && isResultsPanelVisible && (
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'flex items-center gap-1 font-bold text-[var(--ch-text-9)] font-mono',
              activeTab.status === ExecutionStatus.ERROR ? 'text-red-500' : 'text-emerald-400'
            )}
          >
            STATUS {activeTab.status === ExecutionStatus.ERROR ? 'ERROR' : '200 OK'}
          </span>
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowLimitMenu(v => !v); setShowExportMenu(false); }}
              className="flex items-center gap-1 text-[var(--ch-text-9)] font-medium text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted px-1.5 py-0.5 rounded border border-border/40 transition-colors"
              style={{ fontFamily: editorFontFamily }}
            >
              {currentLimitLabel}
              <ChevronDown className="w-2.5 h-2.5" />
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
            <div className="flex items-center gap-0.5 bg-muted/20 px-1 py-0.5 rounded border border-border/40">
              <button
                disabled={activeTab.results.page <= 1 || activeTab.status === ExecutionStatus.EXECUTING}
                onClick={() => handlePageChange(activeTab.results!.page! - 1)}
                className="p-0.5 hover:bg-muted text-muted-foreground rounded disabled:opacity-30 transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="text-[var(--ch-text-9)] font-medium mx-0.5 text-muted-foreground" style={{ fontFamily: editorFontFamily }}>
                {activeTab.results.page}
              </span>
              <button
                disabled={!activeTab.results.hasMore || activeTab.status === ExecutionStatus.EXECUTING}
                onClick={() => handlePageChange(activeTab.results!.page! + 1)}
                className="p-0.5 hover:bg-muted text-muted-foreground rounded disabled:opacity-30 transition-colors"
                title="Next Page"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 text-[var(--ch-text-9)] text-muted-foreground bg-muted/20 px-1.5 py-0.5 rounded border border-border/40" style={{ fontFamily: editorFontFamily }}>
            <Clock className="w-3 h-3 text-muted-foreground/70" />
            {activeTab.results.executionTime}ms
          </div>
          <div className="flex items-center gap-1 text-[var(--ch-text-9)] text-muted-foreground bg-muted/20 px-1.5 py-0.5 rounded border border-border/40" style={{ fontFamily: editorFontFamily }}>
            <span className="font-semibold text-foreground">{sortedRows.length}</span>
            rows
          </div>

          <div className="h-3 w-px bg-border mx-0.5" />

          <div className="flex items-center gap-0.5">
            <div className="flex items-center bg-muted/20 p-0.5 rounded border border-border/40">
              <button
                onClick={() => setViewMode('table')}
                title="Table View"
                className={cn(
                  "px-1.5 py-0.5 text-[var(--ch-text-9)] font-medium rounded-sm transition-colors",
                  viewMode === 'table' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Table2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => setViewMode('json')}
                title="JSON View"
                className={cn(
                  "px-1.5 py-0.5 text-[var(--ch-text-9)] font-medium rounded-sm transition-colors",
                  viewMode === 'json' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileJson className="w-3 h-3" />
              </button>
              <button
                onClick={() => setViewMode('visualize')}
                title="Visualize"
                className={cn(
                  "px-1.5 py-0.5 text-[var(--ch-text-9)] font-medium rounded-sm transition-colors",
                  viewMode === 'visualize' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <BarChart3 className="w-3 h-3" />
              </button>
            </div>
            {editingCell && (
              <button
                onClick={handleSave}
                className="flex items-center gap-1 px-1.5 py-0.5 bg-primary text-primary-foreground rounded text-[var(--ch-text-9)] font-semibold hover:bg-primary/90 transition-all"
              >
                <Save className="w-3 h-3" />
                Apply
              </button>
            )}
            <button
              onClick={() => setShowResultModal(true)}
              className="text-[var(--ch-text-9)] font-medium text-muted-foreground hover:text-foreground hover:bg-muted px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
            </button>

            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowExportMenu(v => !v); setShowLimitMenu(false); }}
                className="text-[var(--ch-text-9)] font-medium text-muted-foreground hover:text-foreground hover:bg-muted px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
              >
                <Download className="w-3 h-3" />
                <ChevronDown className="w-2.5 h-2.5" />
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
  );
}
