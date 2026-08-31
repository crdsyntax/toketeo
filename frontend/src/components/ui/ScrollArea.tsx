import { forwardRef } from 'react'
import type React from 'react'
import { cn } from '@/lib/utils'
import type { ScrollAreaProps } from '@/types/ui'

export type { ScrollAreaProps, ScrollAreaOrientation } from '@/types/ui'

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ orientation = 'both', className, children, ...props }, ref) => {
    const overflow = {
      both: 'overflow-auto',
      vertical: 'overflow-y-auto overflow-x-hidden',
      horizontal: 'overflow-x-auto overflow-y-hidden',
    }

    return (
      <div
        ref={ref}
        className={cn(overflow[orientation], className)}
        {...props}
      >
        {children}
      </div>
    )
  },
)

ScrollArea.displayName = 'ScrollArea'
