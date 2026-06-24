import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Key, Link2 } from 'lucide-react'
import type { ColumnResponse, ForeignKeyResponse } from '@/types/database'
import { cn } from '@/lib/utils'

export type TableNodeData = {
  label: string
  columns: ColumnResponse[]
  foreignKeys: ForeignKeyResponse[]
}

type TableNodeType = Node<TableNodeData, 'table'>

export const TableNode = memo(({ data }: NodeProps<TableNodeType>) => {
  return (
    <div className="bg-card border border-border rounded-lg shadow-md min-w-[220px] overflow-hidden">
      <Handle type="target" position={Position.Top} className="!bg-primary !w-2 !h-2" />
      <div className="bg-primary/10 px-3 py-2 border-b border-border font-semibold text-sm text-primary flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
        <span className="truncate">{data.label}</span>
      </div>
      <div className="divide-y divide-border/50">
        {data.columns.map((col) => (
          <div
            key={col.name}
            className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-1 w-4 shrink-0">
              {col.isPrimaryKey && <Key className="w-3 h-3 text-amber-500" />}
              {data.foreignKeys.some((fk) => fk.columnName === col.name) && (
                <Link2 className="w-3 h-3 text-sky-500" />
              )}
            </div>
            <span className={cn("font-medium truncate", col.isPrimaryKey && "text-amber-500")}>
              {col.name}
            </span>
            <span className="text-muted-foreground ml-auto truncate">{col.type}</span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2 !h-2" />
    </div>
  )
})

TableNode.displayName = 'TableNode'
