import { useState } from 'react'
import { AlertTriangle, X, RefreshCw, Minimize2, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { connectionService } from '@/services/connection.service'
import { useDraggablePanel } from '@/hooks/useDraggablePanel'

interface ConnectionErrorModalProps {
  connectionId: string
  connectionName: string
  error: string
  onClose: () => void
  onReconnected?: () => void
}

export function ConnectionErrorModal({ connectionId, connectionName, error: initialError, onClose, onReconnected }: ConnectionErrorModalProps) {
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [error, setError] = useState(initialError)
  const [isMinimized, setIsMinimized] = useState(false)
  const { pos, handleMouseDown } = useDraggablePanel(320, 80)

  const handleReconnect = async () => {
    setIsReconnecting(true)
    try {
      await connectionService.reconnect(connectionId)
      onReconnected?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reconnection failed')
      setIsReconnecting(false)
    }
  }

  if (isMinimized) {
    return (
      <div className="fixed z-[210]" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
        <div className="bg-muted border border-border rounded-lg shadow-2xl p-3 flex items-center gap-3 min-w-[200px]" data-drag-handle>
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground truncate">Connection Error</p>
            <p className="text-[10px] text-muted-foreground truncate">{connectionName}</p>
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
    <div className="fixed z-[100] w-[400px]" style={{ left: pos.x, top: pos.y }} onMouseDown={handleMouseDown}>
      <div className="bg-muted border border-border rounded-xl shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border cursor-grab active:cursor-grabbing" data-drag-handle>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <h2 className="text-xs font-bold text-foreground">Connection Error</h2>
          </div>
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

        <div className="px-4 py-3 space-y-2.5">
          <p className="text-[11px] text-muted-foreground">
            Lost connection to <span className="font-semibold text-foreground">{connectionName}</span>
          </p>
          <div className="p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
            <p className="text-[10px] font-mono text-destructive/90 break-words leading-relaxed">
              {error}
            </p>
          </div>
          <p className="text-[9px] text-muted-foreground/60">
            The SSH tunnel or database connection was lost. Click Reconnect to try again.
          </p>
        </div>

        <div className="flex items-center justify-end gap-1.5 px-4 py-2.5 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground rounded-lg hover:bg-background transition-all"
          >
            Dismiss
          </button>
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <RefreshCw className={cn("w-3 h-3", isReconnecting && "animate-spin")} />
            {isReconnecting ? 'Reconnecting...' : 'Reconnect'}
          </button>
        </div>
      </div>
    </div>
  )
}
