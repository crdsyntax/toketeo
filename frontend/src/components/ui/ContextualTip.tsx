import { useState, useEffect } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAssistantStore } from '@/store/assistantStore'

interface ContextualTipProps {
  id: string
  message: string
  className?: string
  onAction?: () => void
  actionLabel?: string
}

export function ContextualTip({ id, message, className, onAction, actionLabel }: ContextualTipProps) {
  const [visible, setVisible] = useState(false)
  const dismissedTips = useAssistantStore((s) => s.dismissedTips)
  const dismissTip = useAssistantStore((s) => s.dismissTip)

  useEffect(() => {
    if (!dismissedTips.includes(id)) {
      const timer = setTimeout(() => setVisible(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [id, dismissedTips])

  if (!visible) return null

  return (
    <div
      className={cn(
        'flex items-start gap-2 p-3 rounded-lg border border-primary/20 bg-primary/5 text-xs text-foreground animate-in slide-in-from-top-2 fade-in duration-300',
        className,
      )}
    >
      <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="leading-relaxed">{message}</p>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="mt-1.5 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            {actionLabel} →
          </button>
        )}
      </div>
      <button
        onClick={() => { dismissTip(id); setVisible(false) }}
        className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
