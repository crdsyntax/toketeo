import { useState } from 'react'
import { AlertTriangle, X, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { connectionService } from '@/services/connection.service'

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl shadow-black/50 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-destructive/20">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <h2 className="text-sm font-bold text-foreground">Connection Error</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Lost connection to <span className="font-semibold text-foreground">{connectionName}</span>
          </p>
          <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
            <p className="text-[11px] font-mono text-destructive/90 break-words leading-relaxed">
              {error}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            The SSH tunnel or database connection was lost. Click Reconnect to try again.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-700/60">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
          >
            Dismiss
          </button>
          <button
            onClick={handleReconnect}
            disabled={isReconnecting}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isReconnecting && "animate-spin")} />
            {isReconnecting ? 'Reconnecting...' : 'Reconnect'}
          </button>
        </div>
      </div>
    </div>
  )
}
