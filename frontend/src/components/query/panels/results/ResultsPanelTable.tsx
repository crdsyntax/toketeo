import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import type { QueryTab } from '@/store/useAppStore';
import { useAppStore } from '@/store/useAppStore';
import type { DbRow, DbValue } from '@/types/database';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { formatCellValue } from '@/lib/formatCellValue';

interface ResultsPanelTableProps {
  activeTab: QueryTab;
  sortedRows: DbRow[];
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  requestSort: (key: string) => void;
  editingCell: { rowIndex: number; column: string; value: DbValue } | null;
  setEditingCell: (cell: { rowIndex: number; column: string; value: DbValue } | null) => void;
  handleSave: () => void;
  setContextMenuSql: (menu: { x: number, y: number, row: DbRow } | null) => void;
  selectedRowIndex: number | null;
  setSelectedRowIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setShowExportMenu: (v: boolean) => void;
  setShowLimitMenu: (v: boolean) => void;
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
  selectedRowIndex,
  setSelectedRowIndex,
  setShowExportMenu,
  setShowLimitMenu,
}: ResultsPanelTableProps) {
  const editorFontFamily = useAppStore((s) => s.editorFontFamily);
  const resultsFontSize = useAppStore((s) => s.resultsFontSize);
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
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
    <div ref={parentRef} className="flex-1 overflow-auto relative h-full" onClick={() => { setShowExportMenu(false); setShowLimitMenu(false); }}>
      <table className="w-max min-w-full border-collapse table-fixed" style={{ fontFamily: editorFontFamily, fontSize: resultsFontSize }}>
        <thead className="sticky top-0 z-20 bg-muted shadow-[0_1px_0_0_hsl(var(--border))]">
          <tr>
            <th className="p-2.5 font-semibold text-muted-foreground text-xs border-r border-border/60 w-12 min-w-[3rem] max-w-[3rem] text-center shrink-0 bg-muted select-none">
              #
            </th>
            {activeTab.results!.columns.map((col: string) => {
              const isSorted = sortConfig?.key === col;
              return (
                <th
                  key={col}
                  onClick={() => requestSort(col)}
                  className="p-2.5 font-semibold text-muted-foreground text-xs border-r border-border/60 w-[250px] max-w-[250px] bg-muted cursor-pointer hover:bg-muted-foreground/10 hover:text-foreground transition-colors select-none"
                >
                  <div className="flex items-center justify-between group">
                    <span className="truncate">{col}</span>
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
                  "p-2.5 border-r border-border/60 text-center w-12 min-w-[3rem] cursor-pointer select-none transition-colors",
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
                        "border-r border-border/40 truncate relative text-foreground/90 w-[250px] max-w-[250px] cursor-pointer",
                        isEditing ? "p-0" : "p-2.5"
                      )}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className="absolute inset-0 w-full h-full bg-background border-2 border-primary outline-none px-2.5 z-20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]"
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
                        ) : (formatCellValue(row[col]))
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
