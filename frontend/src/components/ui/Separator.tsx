import { cn } from '@/lib/utils'
import type { SeparatorProps } from '@/types/ui'

export type { SeparatorProps, SeparatorOrientation } from '@/types/ui'

export function Separator({ orientation = 'horizontal', className }: SeparatorProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  )
}
