import { useEffect, useMemo, useState } from 'react'
import { Download, HelpCircle } from 'lucide-react'
import { useVisualizerStore } from '@/store/visualizerStore'
import { tauriApi } from '@/lib/api'
import { CHART_TYPES } from '@/lib/chart-types'
import { detectColumns, suggestChart } from '@/lib/column-detection'
import { ChartRenderer } from './visualize/ChartRenderer'
import { ChartTypeSelector } from './visualize/ChartTypeSelector'
import { ColumnPicker } from './visualize/ColumnPicker'
import { ChartControls } from './visualize/ChartControls'
import { ChartEmptyState } from './visualize/ChartEmptyState'
import { ChartTour } from './visualize/ChartTour'
import type { DbRow } from '@/types/database'

interface VisualizePanelProps {
  sortedRows: DbRow[]
}

export function VisualizePanel({ sortedRows }: VisualizePanelProps) {
  const [tourOpen, setTourOpen] = useState(false)
  const configs = useVisualizerStore((s) => s.configs)
  const setConfig = useVisualizerStore((s) => s.setConfig)

  const tabId = 'visualize-tab'

  const columns = useMemo(() => {
    if (sortedRows.length === 0) return []
    return Object.keys(sortedRows[0])
  }, [sortedRows])

  const profiles = useMemo(() => detectColumns(columns, sortedRows), [columns, sortedRows])
  const suggestion = useMemo(() => suggestChart(profiles), [profiles])
  const config = configs[tabId]

  useEffect(() => {
    if (!config && sortedRows.length > 0) {
      setConfig(tabId, {
        chartType: suggestion.chartType,
        xColumn: suggestion.xColumn,
        yColumns: suggestion.yColumns,
        groupColumn: suggestion.groupColumn,
      })
    }
  }, [config, sortedRows, suggestion, setConfig, tabId])

  if (sortedRows.length === 0) {
    return <ChartEmptyState message="Run a query to visualize results" />
  }

  const numericCols = profiles.filter((p) => p.role === 'numeric')
  if (numericCols.length === 0 && config?.yColumns.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 select-none p-8 text-center">
        <ChartEmptyState message="No numeric columns found — select a Y column to chart" />
        <div className="mt-2">
          <ColumnPicker
            profiles={profiles}
            xColumn={config?.xColumn ?? null}
            yColumns={config?.yColumns ?? []}
            groupColumn={config?.groupColumn ?? null}
            onXChange={(col) => setConfig(tabId, { xColumn: col })}
            onYChange={(cols) => setConfig(tabId, { yColumns: cols })}
            onGroupChange={(col) => setConfig(tabId, { groupColumn: col })}
          />
        </div>
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Chart type selector + export */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-background/80 backdrop-blur shrink-0">
        <ChartTypeSelector
          types={CHART_TYPES}
          active={config.chartType}
          suggested={suggestion.chartType}
          onChange={(type) => setConfig(tabId, { chartType: type })}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTourOpen(true)}
            className="flex items-center gap-1 text-[var(--ch-text-10)] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
            title="How charts work"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={async () => {
              const canvas = document.querySelector(
                '#visualize-chart-container canvas',
              ) as HTMLCanvasElement | null
              if (!canvas) return
              const dataUrl = canvas.toDataURL('image/png')
              const contentBase64 = dataUrl.replace(/^data:image\/png;base64,/, '')
              try {
                await tauriApi.invoke('save_png_dialog', {
                  contentBase64,
                  defaultFileName: 'chart.png',
                  filterName: 'PNG Files',
                  filterExt: 'png',
                })
              } catch (err) {
                console.error('Failed to export PNG:', err)
              }
            }}
            className="flex items-center gap-1 text-[var(--ch-text-10)] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
            title="Export as PNG"
          >
            <Download className="w-3.5 h-3.5" />
            PNG
          </button>
        </div>
      </div>

      <ChartTour open={tourOpen} onClose={() => setTourOpen(false)} />

      {/* Column picker */}
      <div className="px-3 py-1.5 border-b border-border/60 bg-muted/10 shrink-0">
        <ColumnPicker
          profiles={profiles}
          xColumn={config.xColumn}
          yColumns={config.yColumns}
          groupColumn={config.groupColumn}
          onXChange={(col) => setConfig(tabId, { xColumn: col })}
          onYChange={(cols) => setConfig(tabId, { yColumns: cols })}
          onGroupChange={(col) => setConfig(tabId, { groupColumn: col })}
        />
      </div>

      {/* Chart controls */}
      <div className="flex items-center px-3 py-1 border-b border-border/40 bg-muted/5 shrink-0">
        <ChartControls
          config={config}
          onChange={(partial) => setConfig(tabId, partial)}
        />
      </div>

      {/* Chart canvas */}
      <div id="visualize-chart-container" className="flex-1 min-h-0 p-3 bg-muted/5">
        <div className="w-full h-full rounded-lg border border-border/40 bg-card shadow-sm">
          <ChartRenderer
            rows={sortedRows}
            columns={columns}
            config={config}
            theme="dark"
          />
        </div>
      </div>
    </div>
  )
}
