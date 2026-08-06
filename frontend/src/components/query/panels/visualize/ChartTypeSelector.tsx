import { BarChart3, TrendingUp, PieChart, ScatterChart, Circle, Waves } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChartType } from '@/store/visualizerStore'
import type { ChartTypeMeta } from '@/lib/chart-types'

const ICON_MAP: Record<string, React.ReactNode> = {
  BarChart3: <BarChart3 className="w-4 h-4" />,
  TrendingUp: <TrendingUp className="w-4 h-4" />,
  PieChart: <PieChart className="w-4 h-4" />,
  ScatterChart: <ScatterChart className="w-4 h-4" />,
  Circle: <Circle className="w-4 h-4" />,
  AreaChart: <Waves className="w-4 h-4" />,
}

const DESC: Record<string, string> = {
  bar: 'Compare values across categories',
  line: 'Trend over time or sequential data',
  area: 'Emphasize magnitude of change over time',
  pie: 'Show proportions of a whole',
  scatter: 'Correlation between two variables',
  doughnut: 'Show proportions with a hollow center',
}

interface ChartTypeSelectorProps {
  types: ChartTypeMeta[]
  active: ChartType
  suggested: ChartType | null
  onChange: (type: ChartType) => void
}

export function ChartTypeSelector({ types, active, suggested, onChange }: ChartTypeSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      {types.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'relative flex items-center gap-1.5 px-2.5 py-1.5 text-[var(--ch-text-10)] font-medium rounded-md transition-colors border',
            active === t.id
              ? 'bg-primary/10 text-primary border-primary/30 shadow-sm'
              : 'text-muted-foreground border-transparent hover:bg-muted hover:text-foreground',
          )}
          title={DESC[t.id] ?? t.label}
        >
          {ICON_MAP[t.icon] ?? <BarChart3 className="w-4 h-4" />}
          <span className="hidden sm:inline">{t.label}</span>
          {suggested === t.id && (
            <span
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-background"
              title="Recommended"
            />
          )}
        </button>
      ))}
    </div>
  )
}
