import { useEffect, useMemo } from 'react'
import { Download } from 'lucide-react'
import { useVisualizerStore } from '@/store/visualizerStore'
import { CHART_TYPES } from '@/lib/chart-types'
import { detectColumns, suggestChart, type ColumnProfile } from '@/lib/column-detection'
import { ChartRenderer } from './visualize/ChartRenderer'
import { ChartTypeSelector } from './visualize/ChartTypeSelector'
import { ColumnPicker } from './visualize/ColumnPicker'
import { ChartControls } from './visualize/ChartControls'
import { ChartEmptyState } from './visualize/ChartEmptyState'
import type { DbRow } from '@/types/database'

interface VisualizePanelProps {
  sortedRows: DbRow[]
}

export function VisualizePanel({ sortedRows }: VisualizePanelProps) {
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
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border/40 bg-muted/20">
        <ChartTypeSelector
          types={CHART_TYPES}
          active={config.chartType}
          suggested={suggestion.chartType}
          onChange={(type) => setConfig(tabId, { chartType: type })}
        />
        <button
          onClick={() => {
            const canvas = document.querySelector(
              '#visualize-chart-container canvas',
            ) as HTMLCanvasElement | null
            if (canvas) {
              const link = document.createElement('a')
              link.download = 'chart.png'
              link.href = canvas.toDataURL('image/png')
              link.click()
            }
          }}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
          title="Export as PNG"
        >
          <Download className="w-3.5 h-3.5" />
          PNG
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 bg-muted/10">
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

      <div className="flex items-center px-3 py-1 border-b border-border/20 bg-muted/5">
        <ChartControls
          config={config}
          onChange={(partial) => setConfig(tabId, partial)}
        />
      </div>

      <div id="visualize-chart-container" className="flex-1 min-h-0 p-2">
        <ChartRenderer
          rows={sortedRows}
          columns={columns}
          config={config}
          theme="dark"
        />
      </div>
    </div>
  )
}
