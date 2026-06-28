import { cn } from '@/lib/utils'
import type { ChartConfig } from '@/store/visualizerStore'
import { getChartMeta } from '@/lib/chart-types'

interface ChartControlsProps {
  config: ChartConfig
  onChange: (config: Partial<ChartConfig>) => void
}

export function ChartControls({ config, onChange }: ChartControlsProps) {
  const meta = getChartMeta(config.chartType)

  return (
    <div className="flex items-center gap-3 flex-wrap px-1">
      <input
        type="text"
        value={config.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Chart title..."
        className="h-7 text-[11px] px-2 rounded-md border border-border bg-muted/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary w-40"
      />

      {meta.supportsOrientation && (
        <div className="flex items-center gap-1 bg-muted/30 p-0.5 rounded-md border border-border/40">
          <button
            onClick={() => onChange({ orientation: 'vertical' })}
            className={cn(
              'px-2 py-1 text-[10px] font-medium rounded-sm transition-colors',
              config.orientation === 'vertical'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Vertical
          </button>
          <button
            onClick={() => onChange({ orientation: 'horizontal' })}
            className={cn(
              'px-2 py-1 text-[10px] font-medium rounded-sm transition-colors',
              config.orientation === 'horizontal'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Horizontal
          </button>
        </div>
      )}

      {meta.supportsStack && config.yColumns.length > 1 && (
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={config.stacked}
            onChange={(e) => onChange({ stacked: e.target.checked })}
            className="rounded border-border"
          />
          Stacked
        </label>
      )}
    </div>
  )
}
