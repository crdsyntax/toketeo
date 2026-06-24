import { useState } from 'react';
import { Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QueryTab } from '@/store/useAppStore';
import type { DbRow, DbValue } from '@/types/database';
import { ExecutionStatus } from '@/types/database';

import { ResultsPanelHeader } from './results/ResultsPanelHeader';
import { ResultsPanelError } from './results/ResultsPanelError';
import { ResultsPanelTable } from './results/ResultsPanelTable';
import { ResultsPanelSkeleton } from './results/ResultsPanelSkeleton';
import { ResultsPanelJsonView } from './results/ResultsPanelJsonView';
import { VisualizePanel } from './VisualizePanel';

const LIMIT_OPTIONS = [
  { label: '100 rows', value: 100 },
  { label: '500 rows', value: 500 },
  { label: '1 000 rows', value: 1000 },
  { label: '5 000 rows', value: 5000 },
  { label: 'No limit', value: 0 },
];

interface ResultsPanelProps {
  activeTab: QueryTab | null;
  panels: { editor: boolean; results: boolean };
  togglePanel: (panel: 'editor' | 'results') => void;
  editingCell: { rowIndex: number; column: string; value: DbValue } | null;
  setEditingCell: (cell: { rowIndex: number; column: string; value: DbValue } | null) => void;
  handleSave: () => void;
  setShowResultModal: (show: boolean) => void;
  requestSort: (key: string) => void;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  sortedRows: DbRow[];
  updateTabResults: (tabId: string, updates: Partial<QueryTab>) => void;
  handlePageChange: (page: number) => void;
  setContextMenuSql: (menu: { x: number, y: number, row: DbRow } | null) => void;
  queryLimit: number;
  setQueryLimit: (limit: number) => void;
}

export function ResultsPanel({
  activeTab,
  panels,
  togglePanel,
  editingCell,
  setEditingCell,
  handleSave,
  setShowResultModal,
  requestSort,
  sortConfig,
  sortedRows,
  updateTabResults,
  handlePageChange,
  setContextMenuSql,
  queryLimit,
  setQueryLimit,
}: ResultsPanelProps) {
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showLimitMenu, setShowLimitMenu] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'json' | 'visualize'>('table');

  const isResultsPanelVisible = panels?.results ?? false;

  return (
    <div
      className={cn(
        "border border-border/80 rounded-xl bg-card flex flex-col transition-all duration-300 shadow-sm",
        isResultsPanelVisible ? "flex-1 min-h-[150px] overflow-hidden" : "h-11 shrink-0 overflow-visible"
      )}
      onClick={() => { setShowExportMenu(false); setShowLimitMenu(false); }}
    >
      <ResultsPanelHeader
        activeTab={activeTab}
        isResultsPanelVisible={isResultsPanelVisible}
        togglePanel={togglePanel}
        queryLimit={queryLimit}
        setQueryLimit={setQueryLimit}
        handlePageChange={handlePageChange}
        sortedRows={sortedRows}
        editingCell={editingCell}
        handleSave={handleSave}
        setShowResultModal={setShowResultModal}
        viewMode={viewMode}
        setViewMode={setViewMode}
        showExportMenu={showExportMenu}
        setShowExportMenu={setShowExportMenu}
        showLimitMenu={showLimitMenu}
        setShowLimitMenu={setShowLimitMenu}
        LIMIT_OPTIONS={LIMIT_OPTIONS}
      />

      {isResultsPanelVisible && (
        <div className="flex-1 flex flex-col overflow-hidden bg-background relative min-h-0">
          <ResultsPanelError activeTab={activeTab} updateTabResults={updateTabResults} />

          {activeTab?.results && sortedRows.length > 0 ? (
            viewMode === 'json' ? (
              <div className="flex-1 overflow-auto relative h-full">
                <ResultsPanelJsonView sortedRows={sortedRows} />
              </div>
            ) : viewMode === 'visualize' ? (
              <VisualizePanel sortedRows={sortedRows} />
            ) : (
              <ResultsPanelTable
                activeTab={activeTab}
                sortedRows={sortedRows}
                sortConfig={sortConfig}
                requestSort={requestSort}
                editingCell={editingCell}
                setEditingCell={setEditingCell}
                handleSave={handleSave}
                setContextMenuSql={setContextMenuSql}
                selectedRowIndex={selectedRowIndex}
                setSelectedRowIndex={setSelectedRowIndex}
                setShowExportMenu={setShowExportMenu}
                setShowLimitMenu={setShowLimitMenu}
              />
            )
          ) : activeTab?.status !== ExecutionStatus.EXECUTING && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2 select-none animate-in fade-in duration-200">
              <Table2 className="w-8 h-8 opacity-20" />
              <span className="text-xs italic">No data rows returned or empty dataset</span>
            </div>
          )}

          <ResultsPanelSkeleton activeTab={activeTab} />
        </div>
      )}
    </div>
  );
}