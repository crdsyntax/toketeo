import { useEffect, useRef, useState, useCallback } from 'react'
import type React from 'react'
import { X, Minus, Square, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DialogProps, WindowState } from '@/types/ui'

export type { DialogProps, DialogSize, WindowState } from '@/types/ui'

const SIZE_MAP: Record<string, string> = {
  sm: 'w-[400px]',
  md: 'w-[560px]',
  lg: 'w-[720px]',
  xl: 'w-[960px]',
  full: 'w-[95vw] h-[90vh]',
}

export function Dialog({ open, onClose, title, size = 'md', children, className, disableWindowControls }: DialogProps) {
  const [windowState, setWindowState] = useState<WindowState>('normal')
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const dragOrigPos = useRef({ x: 0, y: 0 })
  const dialogRef = useRef<HTMLDivElement>(null)

  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) {
      setWindowState('normal')
      setPos(null)
    }
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleTitlePointerDown = useCallback((e: React.PointerEvent) => {
    if (windowState === 'maximized') return
    e.preventDefault()
    const rect = dialogRef.current?.getBoundingClientRect()
    if (rect && !pos) {
      setPos({ x: rect.left, y: rect.top })
    }
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    dragOrigPos.current = { x: pos?.x ?? rect?.left ?? 0, y: pos?.y ?? rect?.top ?? 0 }
    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      setPos({
        x: dragOrigPos.current.x + (ev.clientX - dragStart.current.x),
        y: Math.max(0, dragOrigPos.current.y + (ev.clientY - dragStart.current.y)),
      })
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.body.style.cursor = 'move'
    document.body.style.userSelect = 'none'
  }, [windowState, pos])

  const toggleMaximize = useCallback(() => {
    setWindowState(prev => prev === 'maximized' ? 'normal' : 'maximized')
  }, [])

  const toggleMinimize = useCallback(() => {
    setWindowState(prev => prev === 'minimized' ? 'normal' : 'minimized')
  }, [])

  if (!open && windowState !== 'minimized') return null

  const isMaximized = windowState === 'maximized'
  const isMinimized = windowState === 'minimized'

  return (
    <>
      {isMinimized ? (
        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 bg-surface border border-border rounded-t-xl shadow-2xl cursor-pointer"
          onClick={toggleMinimize}
          title="Restore"
        >
          <div className="flex items-center gap-3 px-4 py-2">
            <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">{title || 'Dialog'}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClose() }}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={dialogRef}
          className={cn(
            'fixed z-50 bg-surface border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden',
            isMaximized ? 'inset-4 w-auto h-auto' : '',
            !isMaximized && !disableWindowControls ? SIZE_MAP[size] : '',
            !isMaximized && !pos && !disableWindowControls ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2' : '',
            !isMaximized && disableWindowControls ? 'max-w-lg' : '',
            className,
          )}
          style={pos && !isMaximized && !disableWindowControls ? {
            left: pos.x,
            top: pos.y,
            transform: 'none',
          } : undefined}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!disableWindowControls && (
            <div
              className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 cursor-move select-none"
              onPointerDown={handleTitlePointerDown}
            >
              <h2 className="text-sm font-semibold text-foreground truncate mr-4">{title || ''}</h2>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={toggleMinimize}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                  title="Minimize"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={toggleMaximize}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                  title={isMaximized ? 'Restore' : 'Maximize'}
                >
                  {isMaximized ? <Square className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </button>
                <button
                  onClick={onClose}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
          <div className={cn(
            'flex-1 overflow-auto',
            disableWindowControls ? '' : (isMaximized ? '' : 'max-h-[calc(90vh-120px)]'),
          )}>
            {children}
          </div>
        </div>
      )}
    </>
  )
}

export function DialogBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-6 py-4', className)} {...props}>
      {children}
    </div>
  )
}

export function DialogFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-6 py-3 border-t border-border flex items-center justify-end gap-2', className)} {...props}>
      {children}
    </div>
  )
}
