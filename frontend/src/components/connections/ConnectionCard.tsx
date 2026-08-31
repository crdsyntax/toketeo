import { useState, useRef, useEffect } from 'react'
import { Download, Edit2, Trash2, Link as LinkIcon, Loader2, Zap, ChevronDown, Unplug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DatabaseType, Environment } from '@/types/database'
import type { Connection } from '@/types/database'
import { useAppStore } from '@/store/useAppStore'
import { getEngineConfig } from '@/lib/engine-icons'

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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const engineConfig = getEngineConfig(connection.type as DatabaseType)
  const EngineIcon = engineConfig.icon

  return (
    <div
      onDoubleClick={() => onConnect(connection)}
      className={cn(
        'group relative w-full min-w-0 cursor-pointer overflow-hidden flex flex-col rounded-xl bg-surface border border-border shadow-sm hover:shadow-md hover:border-border/80 transition-all duration-200',
        connection.environment === Environment.PRODUCTION &&
          'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-red-500 before:rounded-l-[var(--radius-2xl)] before:rounded-r-full',
        isActive && 'ring-2 ring-emerald-500/40 border-emerald-500/40',
      )}
    >
      {miniToast && (
        <div className={`absolute top-3 right-3 z-20 text-xs rounded-full px-2.5 py-1 font-semibold shadow-lg animate-in slide-in-from-top-1 duration-200 ${miniToast.type === 'success' ? 'bg-emerald-500 text-emerald-950 border border-emerald-400' : 'bg-red-500 text-red-950 border border-red-400'}`}>
          {miniToast.text}
        </div>
      )}


      <div className="p-5 pb-4 flex flex-col gap-3 flex-1 min-h-0">

        <div className={cn('flex items-center justify-center w-10 h-10 rounded-[var(--radius-xl)] shrink-0', engineConfig.bgClass)}>
          <EngineIcon className={cn('w-5 h-5', engineConfig.textClass)} />
        </div>


        <div className="min-w-0">
          <h3 className="font-bold text-sm tracking-tight truncate flex items-center gap-1.5">
            {connection.name}
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
            {connection.host}:{connection.port}
          </p>
          {connection.database && (
            <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
              {connection.database}
            </p>
          )}
        </div>


        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('text-[var(--ch-text-9)] font-bold tracking-widest uppercase px-2 py-0.5 rounded-[var(--radius-2xl)] border', engineConfig.bgClass, engineConfig.textClass, engineConfig.borderClass)}>
            {connection.type.toUpperCase()}
          </span>
          {connection.ssh && (
            <span className="text-[var(--ch-text-9)] font-bold text-blue-400 px-2 py-0.5 rounded-[var(--radius-2xl)] bg-blue-500/10 border border-blue-500/30">
              SSH
            </span>
          )}
        </div>
      </div>


      <div className="flex items-center gap-2 px-4 py-3 border-t border-border/50 bg-muted/20">

        {isActive && onDisconnect ? (
          <button
            onClick={() => onDisconnect(connection.id)}
            disabled={isConnecting || isTesting}
            className={cn('flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius-2xl)] border text-xs font-bold uppercase tracking-wide transition-colors', 'border-destructive/40 text-destructive hover:bg-destructive/10', (isConnecting || isTesting) && 'opacity-60 cursor-not-allowed')}
          >
            <Unplug className="w-3 h-3 shrink-0" /> Disconnect
          </button>
        ) : (
          <button
            onClick={() => onConnect(connection)}
            disabled={isConnecting || isTesting}
            className={cn('flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius-2xl)] border text-xs font-bold uppercase tracking-wide transition-colors', 'border-primary/40 text-primary bg-primary/10 hover:bg-primary/20', (isConnecting || isTesting) && 'opacity-60 cursor-not-allowed')}
          >
            {isConnecting ? (
              <><Loader2 className="w-3 h-3 shrink-0 animate-spin" /> <span className="truncate">Connecting...</span></>
            ) : (
              <><LinkIcon className="w-3 h-3 shrink-0" /> Connect</>
            )}
          </button>
        )}


        {onTest && !isActive && (
          <button
            onClick={() => onTest(connection)}
            disabled={isConnecting || isTesting}
            className={cn('flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius-2xl)] border text-xs font-bold uppercase tracking-wide transition-colors', 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30', (isConnecting || isTesting) && 'opacity-60 cursor-not-allowed')}
          >
            {isTesting ? (
              <><Loader2 className="w-3 h-3 shrink-0 animate-spin" /> <span className="truncate">Testing...</span></>
            ) : (
              <><Zap className="w-3 h-3 shrink-0" /> Test</>
            )}
          </button>
        )}


        <div className="ml-auto relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={isConnecting || isTesting}
            className={cn('p-1.5 rounded-[var(--radius-xl)] text-muted-foreground transition-colors', (!isConnecting && !isTesting) ? 'hover:text-foreground hover:bg-muted/60' : 'opacity-60 cursor-not-allowed')}
          >
            <ChevronDown className={cn('w-4 h-4 transition-transform', menuOpen && 'rotate-180')} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 bottom-full mb-2 w-44 py-1.5 rounded-[var(--radius-xl)] border border-border bg-background shadow-xl z-30 animate-in fade-in slide-in-from-bottom-1 duration-150">
              {onExport && (
                <button
                  onClick={() => { onExport(connection); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              )}
              <button
                onClick={() => { onEdit(connection); setMenuOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
              <div className="my-1 border-t border-border/50" />
              <button
                onClick={() => { onDelete(connection.id); setMenuOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
