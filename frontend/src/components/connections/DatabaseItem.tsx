import { useState } from 'react'
import { Database, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { schemaService } from '@/services/schema.service'
import { useQuery } from '@tanstack/react-query'
import type { Connection } from '@/types/database'
import { SchemaItem } from './SchemaItem'

interface DatabaseItemProps {
  conn: Connection
  dbName: string
  onSelect: (conn: Connection, schema: string) => void
  onSchemaContextMenu?: (e: React.MouseEvent, conn: Connection, schema: string) => void
}

export function DatabaseItem({ conn, dbName, onSelect, onSchemaContextMenu }: DatabaseItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const { data: schemas = [], refetch } = useQuery({
    queryKey: ['schemas', conn.id, dbName],
    queryFn: async () => {
      await schemaService.switchDatabase(conn.id, dbName);
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
        className="flex items-center gap-1.5 p-1.5 cursor-pointer hover:bg-accent/10 hover:text-accent transition-colors rounded-sm"
        onClick={toggleExpand}
      >
        <ChevronDown className={cn("w-3 h-3 transition-transform", !isExpanded && "-rotate-90")} />
        <Database className="w-3 h-3 text-blue-400" />
        <span className="text-[10px] font-mono truncate">{dbName}</span>
      </div>
      {isExpanded && (
        <div className="pl-6 ml-1 border-l border-border/50 space-y-0.5">
          {schemas.map(schema => (
            <SchemaItem key={schema} conn={conn} schema={schema} onSelect={onSelect} onContextMenu={onSchemaContextMenu} />
          ))}
        </div>
      )}
    </div>
  )
}
