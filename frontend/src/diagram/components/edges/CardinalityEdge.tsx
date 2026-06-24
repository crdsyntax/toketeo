import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react'
import type { EdgeCardinality } from '@/types/database'
import { cn } from '@/lib/utils'

export type CardinalityEdgeData = {
  cardinality?: EdgeCardinality
  isManual?: boolean
}

type CardinalityEdgeType = Edge<CardinalityEdgeData>

export const CardinalityEdge = memo(
  ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  }: EdgeProps<CardinalityEdgeType>) => {
    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    })

    const cardinality = data?.cardinality ?? '1:N'
    const isManual = data?.isManual ?? false

    return (
      <>
        <BaseEdge
          path={edgePath}
          className={cn(
            '!stroke-muted-foreground',
            isManual ? '!stroke-dashed' : '!stroke-[1.5px]',
            selected && '!stroke-primary',
          )}
          markerEnd={selected ? 'url(#arrow-primary)' : 'url(#arrow-muted)'}
        />
        <EdgeLabelRenderer>
          <div
            className={cn(
              'absolute px-1.5 py-0.5 rounded text-[9px] font-bold border pointer-events-none',
              'bg-card text-foreground border-border shadow-sm',
              selected && 'border-primary text-primary',
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {cardinality}
          </div>
        </EdgeLabelRenderer>
      </>
    )
  },
)

CardinalityEdge.displayName = 'CardinalityEdge'
