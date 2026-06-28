import { BarChart3 } from 'lucide-react'

interface ChartEmptyStateProps {
  message: string
}

export function ChartEmptyState({ message }: ChartEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 select-none">
      <BarChart3 className="w-8 h-8 opacity-20" />
      <span className="text-xs italic">{message}</span>
    </div>
  )
}
