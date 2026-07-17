import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleConfirm = () => {
    if (requireInput && !value.trim()) return
    onConfirm(value.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onKeyDown={handleKeyDown}>
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl shadow-black/50 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {message && (
            <p className="text-xs text-muted-foreground">{message}</p>
          )}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={inputPlaceholder}
            className={cn(
              "w-full px-3 py-2 text-sm bg-slate-800 border rounded-lg",
              "text-foreground placeholder-muted-foreground/50",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50",
              "border-slate-700/60"
            )}
          />
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-700/60">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={requireInput && !value.trim()}
            className={cn(
              "px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all",
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
