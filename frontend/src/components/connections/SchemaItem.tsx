import { Database, Check, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Connection } from '@/types/database'

interface SchemaItemProps {
  conn: Connection
  schema: string
  isSelected?: boolean
  isDefault?: boolean
  onSelect: (conn: Connection, schema: string) => void
  onToggleDefault?: (conn: Connection, schema: string) => void
  onContextMenu?: (e: React.MouseEvent, conn: Connection, schema: string) => void
}

export function SchemaItem({ conn, schema, isSelected, isDefault, onSelect, onToggleDefault, onContextMenu }: SchemaItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 p-1.5 cursor-pointer rounded-sm transition-all group',
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
      <span className={cn('font-mono truncate flex-1', isSelected && 'font-semibold')}>
        {schema}
      </span>
      {onToggleDefault && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleDefault(conn, schema) }}
          className={cn(
            'p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 shrink-0',
            isDefault ? 'opacity-100 text-amber-400 hover:text-amber-300' : 'text-muted-foreground/40 hover:text-amber-400',
          )}
          title={isDefault ? 'Remove default' : 'Set as default database'}
        >
          <Star className="w-3 h-3" fill={isDefault ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  )
}
