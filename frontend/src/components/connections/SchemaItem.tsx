import { Database } from 'lucide-react'
import type { Connection } from '@/types/database'

interface SchemaItemProps {
  conn: Connection
  schema: string
  onSelect: (conn: Connection, schema: string) => void
}

export function SchemaItem({ conn, schema, onSelect }: SchemaItemProps) {
  return (
    <div 
      className="flex items-center gap-1.5 p-1.5 cursor-pointer hover:bg-accent/10 hover:text-accent transition-colors rounded-sm"
      onDoubleClick={() => onSelect(conn, schema)}
      title={schema}
    >
      <Database className="w-3 h-3 text-muted-foreground" />
      <span className="text-[10px] font-mono truncate">{schema}</span>
    </div>
  )
}
