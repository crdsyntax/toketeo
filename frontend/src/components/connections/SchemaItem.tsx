import { Database, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Connection } from '@/types/database'

interface SchemaItemProps {
  conn: Connection
  schema: string
  isSelected?: boolean
  onSelect: (conn: Connection, schema: string) => void
  onContextMenu?: (e: React.MouseEvent, conn: Connection, schema: string) => void
}

export function SchemaItem({ conn, schema, isSelected, onSelect, onContextMenu }: SchemaItemProps) {
  return (
    <div 
      className={cn(
        'flex items-center gap-1.5 p-1.5 cursor-pointer rounded-sm transition-all group',
        isSelected
          ? 'bg-primary/10 text-primary border-l-2 border-primary ml-0'
          : 'hover:bg-muted/80 hover:text-foreground border-l-2 border-transparent ml-0'
      )}
      onDoubleClick={() => onSelect(conn, schema)}
      onContextMenu={(e) => onContextMenu?.(e, conn, schema)}
      title="Double click to explore schema"
    >
      {isSelected ? (
        <Check className="w-3 h-3 text-primary shrink-0" />
      ) : (
        <Database className="w-3 h-3 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0" />
      )}
      <span className={cn(
        'text-[10px] font-mono truncate',
        isSelected && 'font-semibold'
      )}>
        {schema}
      </span>
    </div>
  )
}
