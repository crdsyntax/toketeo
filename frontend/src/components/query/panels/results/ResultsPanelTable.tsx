import { useRef, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import type { QueryTab } from '@/store/useAppStore';
import { useAppStore } from '@/store/useAppStore';
import type { DbRow, DbValue } from '@/types/database';
import { ArrowUp, ArrowDown, ArrowUpDown, Copy, Check } from 'lucide-react';
import {
  formatCellValue,
  formatEditValue,
  isDateLikeValue,
  toDateTimeLocalInput,
} from '@/lib/formatCellValue';

interface ResultsPanelTableProps {
  activeTab: QueryTab;
  sortedRows: DbRow[];
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  requestSort: (key: string) => void;
  editingCell: { rowIndex: number; column: string; value: DbValue } | null;
  setEditingCell: (cell: { rowIndex: number; column: string; value: DbValue } | null) => void;
  handleSave: () => void;
  setContextMenuSql: (menu: { x: number, y: number, row: DbRow } | null) => void;
  selectedRowIndexes: Set<number>;
  setSelectedRowIndexes: React.Dispatch<React.SetStateAction<Set<number>>>;
  selectionAnchor: number | null;
  setSelectionAnchor: React.Dispatch<React.SetStateAction<number | null>>;
  setShowExportMenu: (v: boolean) => void;
  setShowLimitMenu: (v: boolean) => void;
  handleCopyCell?: (row: DbRow, column: string) => void;
}

export function ResultsPanelTable({
  activeTab,
  sortedRows,
  sortConfig,
  requestSort,
  editingCell,
  setEditingCell,
  handleSave,
  setContextMenuSql,
  selectedRowIndexes,
  setSelectedRowIndexes,
  selectionAnchor,
  setSelectionAnchor,
  setShowExportMenu,
  setShowLimitMenu,
  handleCopyCell,
}: ResultsPanelTableProps) {
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  const resultsFontSize = useAppStore((s) => s.resultsFontSize);
  const parentRef = useRef<HTMLDivElement>(null);
  const copiedTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [copiedCellKey, setCopiedCellKey] = useState<string | null>(null);

  useEffect(() => {
    if (!editingCell) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setEditingCell(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editingCell, setEditingCell, handleSave]);

  const handleRowClick = (e: React.MouseEvent, index: number) => {
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
  };

  const copyCellValue = (row: DbRow, col: string, i: number) => {
    const text = row[col] === null || row[col] === undefined
      ? ''
      : typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col]);
    navigator.clipboard.writeText(text);
    const key = `${i}:${col}`;
    const existing = copiedTimers.current.get(key);
    if (existing) clearTimeout(existing);
    setCopiedCellKey(key);
    copiedTimers.current.set(key, setTimeout(() => {
      setCopiedCellKey(prev => prev === key ? null : prev);
      copiedTimers.current.delete(key);
    }, 1500));
    handleCopyCell?.(row, col);
  };


  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start || 0 : 0;
  const paddingBottom = virtualItems.length > 0
    ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end || 0)
    : 0;

  return (
    <div ref={parentRef} className="flex-1 min-h-0 overflow-auto relative h-full" onClick={() => { setShowExportMenu(false); setShowLimitMenu(false); }}>
      <table className="w-max min-w-full border-collapse table-fixed" style={{ fontFamily: editorFontFamily, fontSize: resultsFontSize }}>
        <thead className="sticky top-0 z-20 bg-muted shadow-[0_1px_0_0_hsl(var(--border))]" style={{ fontFamily: editorFontFamily }}>
          <tr>
            <th className="p-2.5 font-bold text-muted-foreground border-r border-border/60 w-12 min-w-[3rem] max-w-[3rem] text-center shrink-0 bg-muted select-none">
              #
            </th>
            {activeTab.results!.columns.map((col: string, colIdx: number) => {
              const isSorted = sortConfig?.key === col;
              const colType = activeTab.results!.columnTypes?.[colIdx] || activeTab.results!.column_types?.[colIdx];
              return (
                <th
                  key={col}
                  onClick={() => requestSort(col)}
                  className="p-2.5 font-bold text-muted-foreground border-r border-border/60 w-[250px] max-w-[250px] bg-muted cursor-pointer hover:bg-muted-foreground/10 hover:text-foreground transition-colors select-none"
                >
                  <div className="flex items-center justify-between gap-2 group">
                    <span className="flex flex-col min-w-0">
                      <span className="truncate leading-tight">{col}</span>
                      {colType && (
                        <span className="text-[10px] font-normal text-muted-foreground/70 truncate leading-tight">
                          {colType}
                        </span>
                      )}
                    </span>
                    <div className={cn(
                      "p-1 rounded-md transition-colors shrink-0",
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

        <tbody className="divide-y divide-border/40">
          {paddingTop > 0 && (
            <tr>
              <td style={{ padding: 0, border: 0 }} colSpan={activeTab.results!.columns.length + 1}>
                <div style={{ height: `${paddingTop}px` }} />
              </td>
            </tr>
          )}

          {virtualItems.map((virtualRow) => {
            const row = sortedRows[virtualRow.index];
            const i = virtualRow.index;
            const isSelected = selectedRowIndexes.has(i);

            return (
              <tr
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                className={cn(
                  "transition-colors duration-150 group h-9",
                  isSelected ? 'bg-primary/5 hover:bg-primary/5' : 'hover:bg-muted/20'
                )}
                onClick={(e) => handleRowClick(e, i)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenuSql({ x: e.pageX, y: e.pageY, row });
                }}
              >
                <td className={cn(
                  "p-2.5 border-r border-border/60 text-center w-12 min-w-[3rem] cursor-pointer select-none transition-colors",
                  isSelected ? "text-primary font-bold bg-primary/5" : "text-muted-foreground/60 bg-muted/10 group-hover:bg-transparent"
                )}>
                  <span
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSelectedRowIndexes((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      });
                    }}
                    title="Double-click to select row"
                  >
                    {i + 1}
                  </span>
                </td>

                {activeTab.results!.columns.map((col: string, colIdx: number) => {
                  const isEditing = editingCell?.rowIndex === i && editingCell?.column === col;
                  const isNull = row[col] === null;
                  const colType = activeTab.results!.columnTypes?.[colIdx] || activeTab.results!.column_types?.[colIdx];

                  return (
                    <td
                      key={col}
                      onDoubleClick={() => {
                        setSelectedRowIndexes(new Set([i]));
                        setSelectionAnchor(i);
                        setEditingCell({ rowIndex: i, column: col, value: row[col] });
                      }}
                      className={cn(
                        "border-r border-border/40 truncate relative text-foreground/90 w-[250px] max-w-[250px] cursor-pointer",
                        isEditing ? "p-0" : "p-2.5"
                      )}
                    >
                      {isEditing ? (
                        isDateLikeValue(row[col], colType) ? (
                          <input
                            autoFocus
                            type="datetime-local"
                            className="absolute inset-0 w-full h-full bg-background border-2 border-primary outline-none px-2.5 z-20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]"
                            value={toDateTimeLocalInput(formatEditValue(editingCell.value, colType))}
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
                          <input
                            autoFocus
                            className="absolute inset-0 w-full h-full bg-background border-2 border-primary outline-none px-2.5 z-20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]"
                            value={formatEditValue(editingCell.value, colType)}
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
                        )
                      ) : (
                        <div className="flex items-center gap-1">
                          {isNull ? (
                            <span className="inline-block bg-muted/60 border border-border/80 rounded-sm px-1.5 py-0.5 text-[var(--ch-text-10)] text-muted-foreground/70 italic select-none">
                              NULL
                            </span>
                          ) : (
                            <span className="truncate flex-1 min-w-0">{formatCellValue(row[col], colType)}</span>
                          )}
                          {isSelected && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyCellValue(row, col, i);
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
            );
          })}

          {paddingBottom > 0 && (
            <tr>
              <td style={{ padding: 0, border: 0 }} colSpan={activeTab.results!.columns.length + 1}>
                <div style={{ height: `${paddingBottom}px` }} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
