import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import type { ButtonProps } from '@/types/ui'

export type { ButtonProps, ButtonVariant, ButtonSize } from '@/types/ui'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, children, className, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center rounded-md font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none select-none'

    const variants = {
      primary: 'bg-accent text-white hover:bg-accent-hover active:scale-[0.98]',
      secondary: 'bg-surface border border-border text-foreground hover:bg-surface-hover active:scale-[0.98]',
      ghost: 'text-foreground hover:bg-accent-muted hover:text-accent active:scale-[0.98]',
      outline: 'border border-border text-foreground hover:border-accent hover:text-accent active:scale-[0.98]',
      destructive: 'bg-destructive text-destructive-foreground hover:opacity-90 active:scale-[0.98]',
    }

    const sizes = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-10 px-4 text-sm gap-2',
      lg: 'h-12 px-6 text-base gap-2.5',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
