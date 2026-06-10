import { Database, Edit2, Trash2, Globe, Server, Shield, Link as LinkIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Environment } from '@/types/database'
import type { Connection } from '@/types/database'

interface ConnectionCardProps {
  connection: Connection
  onEdit: (conn: Connection) => void
  onDelete: (id: string) => void
  onConnect: (conn: Connection) => void
}

export function ConnectionCard({ connection, onEdit, onDelete, onConnect }: ConnectionCardProps) {
  const getEnvColor = (env: Environment) => {
    switch (env) {
      case Environment.PRODUCTION: return 'bg-red-500/10 text-red-600 border-red-500/20'
      case Environment.STAGING: return 'bg-orange-500/10 text-orange-600 border-orange-500/20'
      case Environment.DEVELOPMENT: return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }

  return (
    <div className={cn(
      "group relative border border-border bg-card p-5 rounded-xl hover:shadow-md transition-shadow overflow-hidden text-left",
      connection.environment === Environment.PRODUCTION && "border-l-4 border-l-red-500"
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Database className="w-6 h-6 text-primary" />
        </div>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => onEdit(connection)}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onDelete(connection.id)}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mb-1">
        <h3 className="font-bold text-lg truncate">{connection.name}</h3>
        <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border", getEnvColor(connection.environment))}>
          {connection.environment}
        </span>
      </div>

      <div className="space-y-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5" />
          <span>{connection.host}:{connection.port}</span>
        </div>
        <div className="flex items-center gap-2">
          <Server className="w-3.5 h-3.5" />
          <span className="truncate">{connection.database}</span>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="uppercase font-semibold text-[10px] tracking-wider bg-muted px-2 py-0.5 rounded">
            {connection.type}
          </div>
          {connection.ssh && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
              <Shield className="w-2.5 h-2.5" /> SSH
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border flex justify-end">
        <button 
          onClick={() => onConnect(connection)}
          className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
        >
          Connect <LinkIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
