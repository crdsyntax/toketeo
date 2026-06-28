import { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ChartConfig } from '@/store/visualizerStore'
import type { DbRow } from '@/types/database'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  CanvasRenderer,
])

interface ChartRendererProps {
  rows: DbRow[]
  columns: string[]
  config: ChartConfig
  theme?: 'dark' | 'light'
}

export function ChartRenderer({ rows, config, theme = 'dark' }: ChartRendererProps) {
  const option = useMemo(() => buildOption(rows, config, theme), [rows, config, theme])

  if (config.yColumns.length === 0 || !config.xColumn) {
    return null
  }

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height: '100%', width: '100%' }}
      notMerge
      lazyUpdate
      theme={theme}
    />
  )
}

function buildOption(rows: DbRow[], config: ChartConfig, theme: string) {
  const isDark = theme === 'dark'

  const textColor = isDark ? '#e5e7eb' : '#374151'
  const axisColor = isDark ? '#4b5563' : '#d1d5db'

  const xValues = rows.map((r) => String(r[config.xColumn] ?? ''))
  const isHorizontal = config.orientation === 'horizontal'

  if (config.chartType === 'pie' || config.chartType === 'doughnut') {
    const data = rows.map((r) => ({
      name: String(r[config.xColumn] ?? ''),
      value: Number(r[config.yColumns[0]] ?? 0),
    }))
    return {
      tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
      legend: { data: data.map((d) => d.name), textStyle: { color: textColor }, bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: config.chartType === 'doughnut' ? ['40%', '70%'] : '70%',
          center: ['50%', '45%'],
          data,
          label: { color: textColor, fontSize: 11 },
          itemStyle: { borderRadius: 4 },
          animationDuration: 800,
        },
      ],
      backgroundColor: 'transparent',
    }
  }

  const base = {
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'cross' as const },
    },
    legend: {
      data: config.yColumns,
      textStyle: { color: textColor },
      bottom: 0,
    },
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40,
      containLabel: true,
    },
    xAxis: isHorizontal
      ? {
          type: 'value' as const,
          axisLabel: { color: textColor, fontSize: 10 },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { lineStyle: { color: axisColor, opacity: 0.3 } },
        }
      : {
          type: 'category' as const,
          data: xValues,
          axisLabel: { color: textColor, fontSize: 10, rotate: xValues.length > 10 ? 45 : 0 },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { show: false },
        },
    yAxis: isHorizontal
      ? {
          type: 'category' as const,
          data: xValues,
          axisLabel: { color: textColor, fontSize: 10 },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { show: false },
        }
      : {
          type: 'value' as const,
          axisLabel: { color: textColor, fontSize: 10 },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { lineStyle: { color: axisColor, opacity: 0.3 } },
        },
    series: config.yColumns.map((col, i) => {
      const values = rows.map((r) => Number(r[col] ?? 0))
      const baseSeries: any = {
        name: col,
        type: config.chartType === 'area' ? 'line' : config.chartType,
        data: isHorizontal ? values : values,
        smooth: config.chartType === 'line' || config.chartType === 'area',
        animationDuration: 800,
        animationEasing: 'cubicOut',
      }
      if (config.chartType === 'area') {
        baseSeries.areaStyle = { opacity: 0.3 }
      }
      if (config.stacked && (config.chartType === 'bar' || config.chartType === 'area')) {
        baseSeries.stack = 'total'
      }
      return baseSeries
    }),
    backgroundColor: 'transparent',
  }

  return base
}
