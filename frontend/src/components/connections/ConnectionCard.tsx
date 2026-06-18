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
      case Environment.PRODUCTION: return 'bg-red-500/5 text-red-500 border-red-500/20'
      case Environment.STAGING: return 'bg-orange-500/5 text-orange-500 border-orange-500/20'
      case Environment.DEVELOPMENT: return 'bg-blue-500/5 text-blue-400 border-blue-500/20'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }

  return (
    <div onDoubleClick={() => onConnect(connection)} className={cn(
      "group relative border border-border bg-secondary/30 p-4 transition-all duration-200 hover:border-primary/30 hover:bg-secondary/50",
      connection.environment === Environment.PRODUCTION && "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-red-500"
    )}>
      {miniToast && (
        <div className={`absolute top-2 right-2 text-xs rounded-md px-2 py-1 font-semibold shadow-lg animate-in slide-in-from-top-1 duration-200 ${miniToast.type === 'success' ? 'bg-emerald-500 text-emerald-900 border border-emerald-700' : 'bg-red-500 text-red-900 border border-red-700'}`}>
          {miniToast.text}
        </div>
      )}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/5 border border-primary/10 rounded-sm">
            <Database className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-sm tracking-tight truncate max-w-[140px]">{connection.name}</h3>
            <span className={cn("inline-flex px-1.5 py-0.5 mt-1 text-[9px] font-bold tracking-widest uppercase border", getEnvColor(connection.environment))}>
              {connection.environment}
            </span>
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onExport && (
            <button
              onClick={() => onExport(connection)}
              disabled={isConnecting || isTesting}
              className={cn("p-1.5 text-muted-foreground transition-colors", (!isConnecting && !isTesting) ? "hover:text-primary hover:bg-primary/5" : "opacity-60 cursor-not-allowed")}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
          <button 
            onClick={() => onEdit(connection)}
            disabled={isConnecting || isTesting}
            className={cn("p-1.5 text-muted-foreground transition-colors", (!isConnecting && !isTesting) ? "hover:text-primary hover:bg-primary/5" : "opacity-60 cursor-not-allowed")}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => onDelete(connection.id)}
            disabled={isConnecting || isTesting}
            className={cn("p-1.5 text-muted-foreground transition-colors", (!isConnecting && !isTesting) ? "hover:text-destructive hover:bg-destructive/5" : "opacity-60 cursor-not-allowed")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
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
          <div className="text-[10px] font-bold tracking-tighter bg-primary/5 text-primary/80 border border-primary/10 px-2 py-0.5">
            {connection.type.toUpperCase()}
          </div>
          {connection.ssh && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-blue-400/5 border border-blue-400/20 px-2 py-0.5">
              <Shield className="w-2.5 h-2.5" /> SSH
            </div>
          )}
        </div>
      </div>

        <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
          <div>
            {onTest && !isActive && (
              <button 
                onClick={() => onTest(connection)}
                disabled={isConnecting || isTesting}
                className={cn("text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 hover:text-primary transition-colors", (isConnecting || isTesting) && "opacity-60 cursor-not-allowed")}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Testing...
                  </>
                ) : (
                  <>Test <Zap className="w-3 h-3" /></>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {onDisconnect && isActive && (
              <button
                onClick={() => onDisconnect(connection.id)}
                disabled={isConnecting || isTesting}
                className={cn("text-[10px] font-bold uppercase tracking-widest text-destructive flex items-center gap-2 hover:translate-x-1 transition-transform", (isConnecting || isTesting) && "opacity-60 cursor-not-allowed")}
              >
                Disconnect
              </button>
            )}

            <button 
              onClick={() => onConnect(connection)}
              disabled={isConnecting || isTesting}
              className={cn("text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2 hover:translate-x-1 transition-transform", (isConnecting || isTesting) && "opacity-60 cursor-not-allowed")}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Connecting...
                </>
              ) : (
                <>Connect <LinkIcon className="w-3 h-3" /></>
              )}
            </button>
          </div>
        </div>

    </div>
  )
}

