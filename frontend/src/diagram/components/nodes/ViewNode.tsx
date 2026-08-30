import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Eye } from 'lucide-react'

export type ViewNodeData = {
  label: string
  query?: string
}

type ViewNodeType = Node<ViewNodeData, 'view'>

export const ViewNode = memo(({ data }: NodeProps<ViewNodeType>) => {
  return (
    <div className="bg-card border border-border rounded-lg shadow-md min-w-[200px] overflow-hidden group">
      <Handle type="target" position={Position.Top} className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-background" title="Drag to connect" />
      <div
        className="bg-emerald-500/10 px-3 py-2 border-b border-border font-semibold text-sm text-emerald-500 flex items-center gap-2 cursor-grab"
        title="Double click to edit"
      >
        <Eye className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{data.label}</span>
      </div>
      <div className="px-3 py-1.5 text-[var(--ch-text-10)] text-muted-foreground uppercase tracking-wider border-b border-border/40">
        View
      </div>
      {data.query ? (
        <pre className="px-3 py-2 text-[var(--ch-text-10)] font-mono text-foreground/80 whitespace-pre-wrap break-all line-clamp-4 max-h-24 overflow-hidden">
          {data.query}
        </pre>
      ) : (
        <div className="px-3 py-2 text-[var(--ch-text-10)] italic text-muted-foreground/40">
          No query — double click to edit
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-background" title="Drag to connect" />
    </div>
  )
})

ViewNode.displayName = 'ViewNode'
