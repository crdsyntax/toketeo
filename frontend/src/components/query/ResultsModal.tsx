import { useState } from 'react';
import {
  Table2,
  Minus,
  Copy,
  Maximize2,
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Download,
  BarChart3,
  FileJson,
} from 'lucide-react';
import { cn, downloadCSV } from '@/lib/utils';
import type { QueryTab } from '@/store/useAppStore';
import type { DbRow, DbValue } from '@/types/database';
import { ExecutionStatus } from '@/types/database';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { ResultsPanelTable } from './panels/results/ResultsPanelTable';
import { ResultsPanelJsonView } from './panels/results/ResultsPanelJsonView';
import { VisualizePanel } from './panels/VisualizePanel';

interface ResultsModalProps {
  isOpen: boolean;
  activeTab: QueryTab | null;
  modalRect: { x: number; y: number; w: number; h: number };
  isMaximized: boolean;
  draggingRef: MutableRefObject<{
    startX: number;
    startY: number;
    startPos: { x: number; y: number };
  } | null>;
  resizingRef: MutableRefObject<{
    startX: number;
    startY: number;
    startSize: { w: number; h: number };
  } | null>;
  setModalRect: Dispatch<
    SetStateAction<{ x: number; y: number; w: number; h: number }>
  >;
  handlePopout?: () => void;
  onClose: () => void;
  toggleMaximize: () => void;
  sortedRows: DbRow[];
  requestSort: (key: string) => void;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  setEditingCell: (
    cell: { rowIndex: number; column: string; value: DbValue } | null,
  ) => void;
  editingCell: { rowIndex: number; column: string; value: DbValue } | null;
  handleSave: () => void;
  handlePageChange: (page: number) => void;
  clearResults: () => void;
  isInteracting: boolean;
  setContextMenuSql: (menu: { x: number, y: number, row: DbRow } | null) => void;
}

export function ResultsModal({
  isOpen,
  activeTab,
  modalRect,
  isMaximized,
  draggingRef,
  resizingRef,
  onClose,
  toggleMaximize,
  sortedRows,
  requestSort,
  sortConfig,
  setEditingCell,
  editingCell,
  handleSave,
  handlePageChange,
  clearResults,
  isInteracting,
  setContextMenuSql,
}: ResultsModalProps) {
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'json' | 'visualize'>('table');

  if (!isOpen || !activeTab?.results) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background p-4 overflow-hidden text-left">
      <div
        className={cn(
          'bg-card border border-border shadow-2xl flex flex-col overflow-hidden absolute transition-all duration-200',
          isMaximized ? '' : 'rounded-none',
        )}
        style={{
          top: `${modalRect.y}%`,
          left: `${modalRect.x}%`,
          width: `${modalRect.w}%`,
          height: `${modalRect.h}%`,
          transition: isInteracting ? 'none' : undefined,
        }}
      >
        <div
          className="h-10 border-b border-border flex justify-between items-center bg-muted/40 cursor-move select-none shrink-0"
          onMouseDown={(e) => {
            if (isMaximized) return;
            draggingRef.current = {
              startX: e.clientX,
              startY: e.clientY,
              startPos: { x: modalRect.x, y: modalRect.y },
            };
          }}
          onDoubleClick={toggleMaximize}
        >
          <div className="flex items-center gap-2 px-4">
            <Table2 className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold truncate max-w-[200px]">
              {activeTab.name} - Results
            </span>

            {activeTab.results.page !== undefined && (
              <div className="flex items-center gap-1 border-l border-border pl-4 ml-2">
                <button
                  disabled={
                    activeTab.results.page <= 1 ||
                    activeTab.status === ExecutionStatus.EXECUTING
                  }
                  onClick={() => handlePageChange(activeTab.results!.page! - 1)}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[var(--ch-text-10)] font-mono font-bold mx-1">
                  PAGE {activeTab.results.page}
                </span>
                <button
                  disabled={
                    !activeTab.results.hasMore ||
                    activeTab.status === ExecutionStatus.EXECUTING
                  }
                  onClick={() => handlePageChange(activeTab.results!.page! + 1)}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-4 ml-4 border-l border-border pl-4">
              <div className="flex items-center gap-1.5 text-[var(--ch-text-10)] text-muted-foreground">
                Rows:{' '}
                <span className="font-bold text-foreground">
                  {activeTab.results.rows.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[var(--ch-text-10)] text-muted-foreground">
                <span className="font-bold text-foreground">
                  {activeTab.results.executionTime}ms
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center h-full">
            <div className="flex items-center bg-muted/30 p-0.5 rounded-md border border-border/40 mr-2">
              <button
                onClick={() => setViewMode('table')}
                className={cn(
                  "px-2 py-1 text-[var(--ch-text-10)] font-medium rounded-sm transition-colors",
                  viewMode === 'table' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                title="Table View"
              >
                <Table2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('json')}
                className={cn(
                  "px-2 py-1 text-[var(--ch-text-10)] font-medium rounded-sm transition-colors",
                  viewMode === 'json' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                title="JSON View"
              >
                <FileJson className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('visualize')}
                className={cn(
                  "px-2 py-1 text-[var(--ch-text-10)] font-medium rounded-sm transition-colors",
                  viewMode === 'visualize' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
                title="Visualize"
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => void downloadCSV(
                  sortedRows,
                  activeTab.results!.columns,
                  `${activeTab.name}-results.csv`,
                )}
              className="h-full px-3 hover:bg-muted text-muted-foreground transition-colors"
              title="Export CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={clearResults}
              className="h-full px-3 hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
              title="Clear Results"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="w-[1px] h-4 bg-border mx-1" />
            <button
              onClick={() => onClose()}
              className="h-full px-3 hover:bg-muted text-muted-foreground transition-colors"
              title="Minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={toggleMaximize}
              className="h-full px-3 hover:bg-muted text-muted-foreground transition-colors"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <Copy className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={() => onClose()}
              className="h-full px-4 hover:bg-destructive hover:text-destructive-foreground transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden relative flex flex-col">
          {viewMode === 'json' ? (
            <ResultsPanelJsonView sortedRows={sortedRows} />
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
              setShowExportMenu={() => {}}
              setShowLimitMenu={() => {}}
            />
          )}

          {!isMaximized && (
            <div
              className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-0.5 hover:text-primary transition-colors z-50"
              onMouseDown={(e) => {
                e.stopPropagation();
                resizingRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  startSize: { w: modalRect.w, h: modalRect.h },
                };
              }}
            >
              <div className="w-2 h-2 border-r-2 border-b-2 border-current opacity-30" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
