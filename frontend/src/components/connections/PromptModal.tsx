import { useState, useEffect, useRef } from 'react'
import { X, Minimize2, Maximize2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDraggablePanel } from '@/hooks/useDraggablePanel'

interface PromptModalProps {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  inputPlaceholder?: string
  requireInput?: boolean
  onConfirm: (value: string) => void
  onClose: () => void
}

export function PromptModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  inputPlaceholder = '',
  requireInput = false,
  onConfirm,
  onClose,
}: PromptModalProps) {
  const [value, setValue] = useState('')
  const [isMinimized, setIsMinimized] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { pos, handleMouseDown } = useDraggablePanel(320, 160)

  useEffect(() => {
    if (!isMinimized) {
      inputRef.current?.focus()
    }
  }, [isMinimized])

  const handleConfirm = () => {
    if (requireInput && !value.trim()) return
    onConfirm(value.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') onClose()
  }

  if (isMinimized) {
    return (
      <div className="fixed z-[210]" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
        <div className="bg-muted border border-border rounded-lg shadow-2xl p-3 flex items-center gap-3 min-w-[200px]" data-drag-handle>
          {destructive ? (
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-primary shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground truncate">{title}</p>
          </div>
          <button
            onClick={() => setIsMinimized(false)}
            className="p-1 hover:bg-background rounded shrink-0"
            title="Expand"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-background rounded shrink-0"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed z-[100] w-[360px]"
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
    >
      <div className="bg-muted border border-border rounded-xl shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border cursor-grab active:cursor-grabbing" data-drag-handle>
          <h2 className="text-xs font-bold text-foreground">{title}</h2>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-all"
              title="Minimize"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          {message && (
            <p className="text-[var(--ch-text-11)] text-muted-foreground">{message}</p>
          )}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={inputPlaceholder}
            className={cn(
              "w-full px-3 py-1.5 text-xs bg-background border rounded-lg",
              "text-foreground placeholder-muted-foreground/50",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50",
              "border-border"
            )}
          />
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[var(--ch-text-10)] font-semibold text-muted-foreground hover:text-foreground rounded-lg hover:bg-background transition-all"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={requireInput && !value.trim()}
            className={cn(
              "px-3 py-1.5 text-[var(--ch-text-10)] font-bold rounded-lg transition-all",
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
