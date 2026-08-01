import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Eye } from 'lucide-react'

export type ViewNodeData = {
  label: string
}

type ViewNodeType = Node<ViewNodeData, 'view'>

export const ViewNode = memo(({ data }: NodeProps<ViewNodeType>) => {
  return (
    <div className="bg-card border border-border rounded-lg shadow-md min-w-[180px] overflow-hidden">
      <Handle type="target" position={Position.Top} className="!bg-emerald-500 !w-2 !h-2" />
      <div className="bg-emerald-500/10 px-3 py-2 border-b border-border font-semibold text-sm text-emerald-500 flex items-center gap-2">
        <Eye className="w-3.5 h-3.5" />
        <span className="truncate">{data.label}</span>
      </div>
      <div className="px-3 py-2 text-[var(--ch-text-10)] text-muted-foreground uppercase tracking-wider">
        View
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-2 !h-2" />
    </div>
  )
})

ViewNode.displayName = 'ViewNode'
