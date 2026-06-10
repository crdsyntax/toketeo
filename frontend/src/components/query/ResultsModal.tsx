import { Table2, ExternalLink, Minus, Copy, Maximize2, X, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tab } from '@/store/useAppStore'
import type { DbRow, DbValue } from '@/types/database'

interface ResultsModalProps {
  showResultModal: boolean
  activeTab: Tab | null
  modalRect: { x: number; y: number; w: number; h: number }
  isMaximized: boolean
  draggingRef: React.MutableRefObject<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>
  resizingRef: React.MutableRefObject<{ startX: number; startY: number; startSize: { w: number; h: number } } | null>
  handlePopout: () => void
  setShowResultModal: (show: boolean) => void
  toggleMaximize: () => void
  sortedRows: DbRow[]
  requestSort: (key: string) => void
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null
  setEditingCell: (cell: { rowIndex: number; column: string; value: DbValue } | null) => void
  editingCell: { rowIndex: number; column: string; value: DbValue } | null
  handleSave: () => void
  setModalRect: (rect: { x: number; y: number; w: number; h: number }) => void
}

export function ResultsModal({
  showResultModal, activeTab, modalRect, isMaximized, draggingRef, resizingRef,
  handlePopout, setShowResultModal, toggleMaximize, sortedRows, requestSort,
  sortConfig, setEditingCell, editingCell, handleSave, setModalRect
}: ResultsModalProps) {
  if (!showResultModal || !activeTab?.results) return null

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm p-4 overflow-hidden text-left">
      <div 
        className={cn(
          "bg-card border border-border shadow-2xl flex flex-col overflow-hidden absolute transition-all duration-200",
          isMaximized ? "" : "rounded-xl"
        )}
        style={{ 
          top: `${modalRect.y}%`, 
          left: `${modalRect.x}%`, 
          width: `${modalRect.w}%`, 
          height: `${modalRect.h}%`,
          transition: draggingRef.current || resizingRef.current ? 'none' : undefined
        }}
      >
        <div 
          className="h-10 border-b border-border flex justify-between items-center bg-muted/40 cursor-move select-none shrink-0"
          onMouseDown={(e) => {
            if (isMaximized) return;
            draggingRef.current = { startX: e.clientX, startY: e.clientY, startPos: { x: modalRect.x, y: modalRect.y } }
          }}
          onDoubleClick={toggleMaximize}
        >
          <div className="flex items-center gap-2 px-4">
            <Table2 className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold truncate max-w-[200px]">
              {activeTab.name} - Results
            </span>
          </div>

          <div className="flex items-center h-full">
            <button 
              onClick={handlePopout}
              className="h-full px-3 hover:bg-muted text-muted-foreground transition-colors"
              title="External window"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <div className="w-[1px] h-4 bg-border mx-1" />
            <button 
              onClick={() => setShowResultModal(false)}
              className="h-full px-3 hover:bg-muted text-muted-foreground transition-colors"
              title="Minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={toggleMaximize}
              className="h-full px-3 hover:bg-muted text-muted-foreground transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Copy className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button 
              onClick={() => setShowResultModal(false)} 
              className="h-full px-4 hover:bg-destructive hover:text-destructive-foreground transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto relative">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="sticky top-0 bg-background border-b border-border z-10">
              <tr>
                {activeTab.results.columns.map((col) => (
                  <th 
                    key={col} 
                    onClick={() => requestSort(col)}
                    className="p-3 font-bold bg-muted/50 border-r border-border cursor-pointer hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {col}
                      {sortConfig?.key === col ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 whitespace-nowrap">
                  {activeTab.results!.columns.map((col) => (
                    <td 
                      key={col} 
                      onDoubleClick={() => setEditingCell({ rowIndex: i, column: col, value: row[col] })}
                      className="p-3 border-r border-border last:border-0 relative"
                    >
                      {editingCell?.rowIndex === i && editingCell?.column === col ? (
                        <input 
                          autoFocus
                          className="absolute inset-0 w-full h-full bg-background border-2 border-primary outline-none px-3 z-20"
                          value={typeof editingCell.value === 'boolean' ? String(editingCell.value) : (editingCell.value ?? '')}
                          onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave();
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                        />
                      ) : (
                        row[col] === null ? <span className="text-muted-foreground italic">NULL</span> : String(row[col])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {!isMaximized && (
            <div 
              className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-0.5 hover:text-primary transition-colors"
              onMouseDown={(e) => {
                e.stopPropagation()
                resizingRef.current = { startX: e.clientX, startY: e.clientY, startSize: { w: modalRect.w, h: modalRect.h } }
              }}
            >
              <div className="w-2 h-2 border-r-2 border-b-2 border-current opacity-30" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
