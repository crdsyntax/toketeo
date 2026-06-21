import { Clock, Save, Maximize2, Download, ChevronUp, ChevronDown, Table2, ChevronLeft, ChevronRight, FileJson, FileText } from 'lucide-react';
import { cn, downloadCSV } from '@/lib/utils';
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
  isMongo: boolean;
  viewMode: 'table' | 'json';
  setViewMode: (mode: 'table' | 'json') => void;
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
  isMongo,
  viewMode,
  setViewMode,
  showExportMenu,
  setShowExportMenu,
  showLimitMenu,
  setShowLimitMenu,
  LIMIT_OPTIONS
}: ResultsPanelHeaderProps) {
  const currentLimitLabel = LIMIT_OPTIONS.find(o => o.value === queryLimit)?.label ?? `${queryLimit} rows`;

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
            {isMongo && (
              <div className="flex items-center bg-muted/30 p-0.5 rounded-md border border-border/40 mr-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium rounded-sm transition-colors",
                    viewMode === 'table' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Table
                </button>
                <button
                  onClick={() => setViewMode('json')}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium rounded-sm transition-colors",
                    viewMode === 'json' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  JSON
                </button>
              </div>
            )}
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
  );
}
