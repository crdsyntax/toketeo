import { Diff, ArrowRightLeft, Check, X } from 'lucide-react'
import { formatCellValue } from '@/lib/formatCellValue'
import { useEffect } from 'react'
import type { ReviewChangePanelProps } from '@/types/ui'

export type { ReviewChangePanelProps } from '@/types/ui'

export function ReviewChangePanel({ column, prevValue, nextValue, onConfirm, onDiscard, position }: ReviewChangePanelProps) {
  const centered = !position

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDiscard();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onDiscard, onConfirm]);

  return (
    <div
      className={cnFixed(centered)}
      style={centered ? undefined : { top: position.top, left: position.left }}
    >
      <div className="bg-muted/50 px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Diff className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider">Review Change</span>
        </div>
        <button onClick={onDiscard} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3 text-xs space-y-2 font-mono bg-muted/10">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Column</span>
          <span className="font-bold text-foreground">{column}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-2 border-t border-border/50">
          <div className="p-2 bg-destructive/10 text-destructive rounded overflow-x-auto whitespace-nowrap">
            {formatCellValue(prevValue) || <span className="italic opacity-50">NULL</span>}
          </div>
          <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
          <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded overflow-x-auto whitespace-nowrap">
            {formatCellValue(nextValue) || <span className="italic opacity-50">EMPTY</span>}
          </div>
        </div>
      </div>
      <div className="p-2 bg-muted/30 border-t border-border flex justify-end gap-2">
        <button
          onClick={onDiscard}
          className="px-3 py-1.5 text-xs font-medium hover:bg-muted rounded"
        >
          Discard
        </button>
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded flex items-center gap-1.5 shadow-sm"
        >
          <Check className="w-3.5 h-3.5" />
          Commit
        </button>
      </div>
    </div>
  )
}

function cnFixed(centered: boolean): string {
  const base =
    'fixed z-50 bg-background border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col w-[400px] max-w-[calc(100vw-16px)] animate-in fade-in zoom-in-95 duration-150'
  return centered ? `${base} left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` : base
}
