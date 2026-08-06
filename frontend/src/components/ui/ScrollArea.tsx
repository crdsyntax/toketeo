import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'both' | 'vertical' | 'horizontal'
}

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
