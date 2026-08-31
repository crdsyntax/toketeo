import type React from 'react'
import { cn } from '@/lib/utils'
import type { CardProps } from '@/types/ui'

export type { CardProps, CardElevation } from '@/types/ui'

export function Card({ elevation = 'flat', className, children, ...props }: CardProps) {
  const elevations = {
    flat: 'bg-surface border border-border',
    raised: 'bg-surface-elevated border border-border shadow-sm',
    overlay: 'bg-surface-elevated border border-border shadow-lg',
  }

  return (
    <div className={cn('rounded-lg', elevations[elevation], className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 py-4 border-b border-border', className)} {...props}>
      {children}
    </div>
  )
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 py-4', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 py-3 border-t border-border flex items-center gap-2', className)} {...props}>
      {children}
    </div>
  )
}
