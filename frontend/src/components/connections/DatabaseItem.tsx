import { useState } from 'react'
import { Database, ChevronDown, Star, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { schemaService } from '@/services/schema.service'
import { useQuery } from '@tanstack/react-query'
import type { Connection } from '@/types/database'
import { SchemaItem } from './SchemaItem'

interface DatabaseItemProps {
  conn: Connection
  dbName: string
  activeConnection: Connection | null
  activeDatabaseName?: string | null
  onSelect: (conn: Connection, schema: string) => void
  onSelectSchema?: (conn: Connection, dbName: string, schema: string) => void
  onSelectDatabase?: (conn: Connection, dbName: string) => void
  onSelectRedisNamespace?: (conn: Connection, dbName: string, namespace: string) => void
  onToggleDefault?: (conn: Connection, schema: string) => void
  onSchemaContextMenu?: (e: React.MouseEvent, conn: Connection, schema: string) => void
}

export function DatabaseItem({ conn, dbName, activeConnection, activeDatabaseName, onSelect, onSelectSchema, onSelectDatabase, onSelectRedisNamespace, onToggleDefault, onSchemaContextMenu }: DatabaseItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isRedis = conn.type === 'redis'

  const { data: items = [], refetch } = useQuery({
    queryKey: isRedis ? ['redis-keys', conn.id, dbName] : ['schemas', conn.id, dbName],
    queryFn: async () => {
      await schemaService.switchDatabase(conn.id, dbName);
      if (isRedis) {
        const tables = await schemaService.getTables(conn.id, dbName);
        return tables.map(t => t.name);
      }
      return schemaService.getSchemas(conn.id);
    },
    enabled: false,
  })

  const toggleExpand = async () => {
    if (!isExpanded) {
      await refetch();
    }
    setIsExpanded(!isExpanded);
  }

  return (
    <div className="text-foreground">
      <div 
        className="flex items-center gap-1.5 p-1.5 cursor-pointer hover:bg-muted/80 hover:text-foreground transition-colors rounded-sm group"
        onClick={toggleExpand}
        onDoubleClick={(e) => { e.stopPropagation(); onSelectDatabase?.(conn, dbName); if (!isExpanded) toggleExpand(); }}
        onContextMenu={(e) => onSchemaContextMenu?.(e, conn, dbName)}
        title={isRedis ? 'Double click to explore keys in this database' : 'Double click to switch to this database'}
      >
        <ChevronDown className={cn("w-3 h-3 transition-transform", !isExpanded && "-rotate-90")} />
        <Database className="w-3 h-3 text-blue-400" />
        <span className="font-mono truncate flex-1">{dbName}</span>
        {conn.defaultDatabase === dbName && (
          <Star className="w-3 h-3 text-amber-400 shrink-0" fill="currentColor" />
        )}
      </div>
      {isExpanded && (
        <div className="pl-6 ml-1 border-l border-border/50 space-y-0.5">
          {items.length === 0 ? (
            <div className="p-1.5 text-xs text-muted-foreground italic">No keys found</div>
          ) : isRedis ? (
            items.map((ns) => (
              <div
                key={ns}
                className="flex items-center gap-1 p-1.5 cursor-pointer hover:bg-muted/80 hover:text-foreground transition-colors rounded-sm"
                onDoubleClick={(e) => { e.stopPropagation(); onSelectRedisNamespace?.(conn, dbName, ns) }}
                title="Double click to explore this namespace"
              >
                <Table2 className="w-3 h-3 text-amber-500 shrink-0" />
                <span className="font-mono truncate flex-1">{ns}</span>
              </div>
            ))
          ) : (
            items.map(schema => (
              <SchemaItem key={schema} conn={conn} schema={schema} isSelected={activeConnection?.id === conn.id && activeDatabaseName === dbName && activeConnection?.database === schema} isDefault={conn.defaultDatabase === schema} onSelect={onSelectSchema ? (c, s) => onSelectSchema(c, dbName, s) : onSelect} onToggleDefault={onToggleDefault} onContextMenu={onSchemaContextMenu} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
