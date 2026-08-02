import { Database, Download, Edit2, Trash2, Globe, Server, Shield, Link as LinkIcon, Loader2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Environment } from '@/types/database'
import type { Connection } from '@/types/database'
import { useAppStore } from '@/store/useAppStore'

interface ConnectionCardProps {
  connection: Connection
  onEdit: (conn: Connection) => void
  onDelete: (id: string) => void
  onConnect: (conn: Connection) => void
  onTest?: (conn: Connection) => void
  onDisconnect?: (id: string) => void
  onExport?: (conn: Connection) => void
  isConnecting?: boolean
  isTesting?: boolean
  isActive?: boolean
}

export function ConnectionCard({ connection, onEdit, onDelete, onConnect, onTest, onExport, isConnecting, isTesting, onDisconnect, isActive }: ConnectionCardProps) {
  const miniToast = useAppStore((state) => state.miniToasts[connection.id])
  const getEnvColor = (env: Environment) => {
    switch (env) {
      case Environment.PRODUCTION: return 'bg-red-500/10 text-red-500 border-red-500/25'
      case Environment.STAGING: return 'bg-orange-500/10 text-orange-500 border-orange-500/25'
      case Environment.DEVELOPMENT: return 'bg-blue-500/10 text-blue-400 border-blue-500/25'
      default: return 'bg-muted/50 text-muted-foreground border-border'
    }
  }

  return (
    <div
      onDoubleClick={() => onConnect(connection)}
      className={cn(
        'clay-card group relative w-full min-w-0 p-5 cursor-pointer overflow-hidden flex flex-col',
        connection.environment === Environment.PRODUCTION &&
          'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-red-500 before:rounded-l-[var(--radius-2xl)] before:rounded-r-full',
        isActive && 'ring-2 ring-emerald-500/40 border-emerald-500/40',
      )}
    >
      {miniToast && (
        <div className={`absolute top-3 right-3 z-10 text-xs rounded-full px-2.5 py-1 font-semibold shadow-lg animate-in slide-in-from-top-1 duration-200 ${miniToast.type === 'success' ? 'bg-emerald-500 text-emerald-950 border border-emerald-400' : 'bg-red-500 text-red-950 border border-red-400'}`}>
          {miniToast.text}
        </div>
      )}

        <div className="flex items-start justify-between gap-2 mb-5">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="clay-raised flex items-center justify-center w-11 h-11 shrink-0 bg-gradient-to-b from-white/10 to-transparent">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm tracking-tight truncate flex items-center gap-1.5">
                {connection.name}
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />}
              </h3>
              <span className={cn('inline-flex px-2 py-0.5 mt-1.5 text-[var(--ch-text-9)] font-bold tracking-widest uppercase rounded-full', getEnvColor(connection.environment))}>
                {connection.environment}
              </span>
            </div>
          </div>

          {/* Actions: always visible on small screens (no hover on touch) */}
          <div className="flex gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            {onExport && (
              <button
                onClick={() => onExport(connection)}
                disabled={isConnecting || isTesting}
                className={cn('p-1.5 rounded-full text-muted-foreground transition-colors', (!isConnecting && !isTesting) ? 'hover:text-primary hover:bg-primary/10' : 'opacity-60 cursor-not-allowed')}
                title="Export"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => onEdit(connection)}
              disabled={isConnecting || isTesting}
              className={cn('p-1.5 rounded-full text-muted-foreground transition-colors', (!isConnecting && !isTesting) ? 'hover:text-primary hover:bg-primary/10' : 'opacity-60 cursor-not-allowed')}
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(connection.id)}
              disabled={isConnecting || isTesting}
              className={cn('p-1.5 rounded-full text-muted-foreground transition-colors', (!isConnecting && !isTesting) ? 'hover:text-destructive hover:bg-destructive/10' : 'opacity-60 cursor-not-allowed')}
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      <div className="space-y-2.5 text-xs text-muted-foreground flex-1 min-h-0">
        <div className="flex items-center gap-2 font-mono">
          <Globe className="w-3 h-3 opacity-50" />
          <span className="truncate">{connection.host}:{connection.port}</span>
        </div>
        {connection.database && (
          <div className="flex items-center gap-2 font-mono">
            <Server className="w-3 h-3 opacity-50" />
            <span className="truncate">{connection.database}</span>
          </div>
        )}
        <div className="flex items-center gap-2 pt-2">
          <div className="clay-raised text-[var(--ch-text-10)] font-bold tracking-tighter text-primary/90 px-2.5 py-1 rounded-full">
            {connection.type.toUpperCase()}
          </div>
          {connection.ssh && (
            <div className="clay-raised flex items-center gap-1 text-[var(--ch-text-10)] font-bold text-blue-400 px-2.5 py-1 rounded-full">
              <Shield className="w-2.5 h-2.5" /> SSH
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-border/50 grid grid-cols-2 gap-2">
        {onTest && !isActive && (
          <button
            onClick={() => onTest(connection)}
            disabled={isConnecting || isTesting}
            className={cn('clay-btn w-full min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-wide text-muted-foreground hover:text-primary transition-colors', (isConnecting || isTesting) && 'opacity-60 cursor-not-allowed')}
          >
            {isTesting ? (
              <>
                <Loader2 className="w-3 h-3 shrink-0 animate-spin" /> <span className="truncate">Testing...</span>
              </>
            ) : (
              <>Test <Zap className="w-3 h-3 shrink-0" /></>
            )}
          </button>
        )}

        {onDisconnect && isActive && (
          <button
            onClick={() => onDisconnect(connection.id)}
            disabled={isConnecting || isTesting}
            className={cn('clay-btn w-full min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-wide text-destructive transition-colors', (isConnecting || isTesting) && 'opacity-60 cursor-not-allowed')}
          >
            Disconnect
          </button>
        )}

        <button
          onClick={() => onConnect(connection)}
          disabled={isConnecting || isTesting}
          className={cn('clay-btn w-full min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 text-[var(--ch-text-10)] font-bold uppercase tracking-wide text-primary bg-primary/10 transition-colors', (isConnecting || isTesting) && 'opacity-60 cursor-not-allowed')}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-3 h-3 shrink-0 animate-spin" /> <span className="truncate">Connecting...</span>
            </>
          ) : (
            <>Connect <LinkIcon className="w-3 h-3 shrink-0" /></>
          )}
        </button>
      </div>
    </div>
  )
}
