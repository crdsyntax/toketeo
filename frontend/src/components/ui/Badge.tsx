import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  size?: 'sm' | 'md'
}

export function Badge({ variant = 'default', size = 'md', className, children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-accent-muted text-accent border border-accent/20',
    success: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
    error: 'bg-red-500/10 text-red-500 border border-red-500/20',
    info: 'bg-sky-500/10 text-sky-500 border border-sky-500/20',
  }

  const sizes = {
    sm: 'px-1.5 py-0.5 text-[var(--ch-text-10)]',
    md: 'px-2 py-0.5 text-xs',
  }

  return (
    <span className={cn('inline-flex items-center rounded-full font-medium', variants[variant], sizes[size], className)} {...props}>
      {children}
    </span>
  )
}
