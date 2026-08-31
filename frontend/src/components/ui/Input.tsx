import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import type { InputProps } from '@/types/ui'

export type { InputProps } from '@/types/ui'

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, label, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full h-10 px-3 text-sm rounded-md border bg-surface text-foreground placeholder:text-muted-foreground transition-colors duration-150',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
            error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-border hover:border-accent/50',
            'disabled:opacity-50 disabled:pointer-events-none',
            className,
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'
