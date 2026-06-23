import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Terminal } from 'lucide-react'

export type ProcedureNodeData = {
  label: string
}

type ProcedureNodeType = Node<ProcedureNodeData, 'procedure'>

export const ProcedureNode = memo(({ data }: NodeProps<ProcedureNodeType>) => {
  return (
    <div className="bg-card border border-border rounded-lg shadow-md min-w-[180px] overflow-hidden">
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-2 !h-2" />
      <div className="bg-purple-500/10 px-3 py-2 border-b border-border font-semibold text-sm text-purple-500 flex items-center gap-2">
        <Terminal className="w-3.5 h-3.5" />
        <span className="truncate">{data.label}</span>
      </div>
      <div className="px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider">
        Procedure
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500 !w-2 !h-2" />
    </div>
  )
})

ProcedureNode.displayName = 'ProcedureNode'
