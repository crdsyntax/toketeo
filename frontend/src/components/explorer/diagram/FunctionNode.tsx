import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Binary } from 'lucide-react'

export type FunctionNodeData = {
  label: string
}

type FunctionNodeType = Node<FunctionNodeData, 'function'>

export const FunctionNode = memo(({ data }: NodeProps<FunctionNodeType>) => {
  return (
    <div className="bg-card border border-border rounded-lg shadow-md min-w-[180px] overflow-hidden">
      <Handle type="target" position={Position.Top} className="!bg-cyan-500 !w-2 !h-2" />
      <div className="bg-cyan-500/10 px-3 py-2 border-b border-border font-semibold text-sm text-cyan-500 flex items-center gap-2">
        <Binary className="w-3.5 h-3.5" />
        <span className="truncate">{data.label}</span>
      </div>
      <div className="px-3 py-2 text-[10px] text-muted-foreground uppercase tracking-wider">
        Function
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-500 !w-2 !h-2" />
    </div>
  )
})

FunctionNode.displayName = 'FunctionNode'
