import { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react'
import * as echarts from 'echarts'
import type { ChartConfig, ChartType } from '@/store/visualizerStore'
import type { DbRow } from '@/types/database'

interface ChartRendererProps {
  rows: DbRow[]
  columns: string[]
  config: ChartConfig
  theme?: 'dark' | 'light'
}

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899',
  '#06b6d4', '#8b5cf6', '#f97316', '#14b8a6', '#e11d48',
]

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
  const labelColor = isDark ? '#9ca3af' : '#6b7280'
  const axisColor = isDark ? '#4b5563' : '#d1d5db'
  const bgColor = 'transparent'

  const xCol = config.xColumn ?? ''
  const xValues = rows.map((r) => String(r[xCol] ?? ''))
  const isHorizontal = config.orientation === 'horizontal'
  const showLabels = config.dataLabels
  const chartType = config.chartType

  if (chartType === 'pie' || chartType === 'doughnut') {
    const data = rows.map((r, i) => ({
      name: String(r[xCol] ?? ''),
      value: Number(r[config.yColumns[0]] ?? 0),
      itemStyle: { color: COLORS[i % COLORS.length] },
    }))

    return {
      color: COLORS,
      title: config.title
        ? { text: config.title, left: 'center', textStyle: { color: textColor, fontSize: 14, fontWeight: 600 } }
        : undefined,
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const pct = p.percent ? ` (${p.percent.toFixed(1)}%)` : ''
          return `<strong>${p.name}</strong><br/>${p.value}${pct}`
        },
        backgroundColor: isDark ? 'rgba(30,30,40,0.95)' : 'rgba(255,255,255,0.95)',
        borderColor: axisColor,
        borderWidth: 1,
        textStyle: { color: textColor, fontSize: 12 },
      },
      legend: {
        data: data.map((d) => d.name),
        textStyle: { color: labelColor, fontSize: 11 },
        bottom: 0,
        type: 'scroll',
      },
      series: [
        {
          type: 'pie',
          radius: chartType === 'doughnut' ? ['38%', '68%'] : '65%',
          center: ['50%', config.title ? '42%' : '48%'],
          data,
          label: {
            color: textColor,
            fontSize: 11,
            formatter: showLabels ? '{b}: {d}%' : undefined,
            show: showLabels,
          },
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' },
            label: { show: true, fontSize: 12, fontWeight: 'bold' },
          },
          animationDuration: 800,
          animationEasing: 'cubicOut',
        },
      ],
      backgroundColor: bgColor,
    }
  }

  const series = config.yColumns.map((col, i) => {
    const values = rows.map((r) => Number(r[col] ?? 0))
    const seriesType = chartType === 'area' ? 'line' : chartType

    const item: any = {
      name: col,
      type: seriesType,
      data: values,
      smooth: chartType === 'line' || chartType === 'area',
      animationDuration: 800,
      animationEasing: 'cubicOut',
      symbolSize: chartType === 'scatter' ? 8 : 4,
      symbol: chartType === 'scatter' ? 'circle' : 'none',
      itemStyle: { color: COLORS[i % COLORS.length] },
      lineStyle: { width: 2 },
    }

    if (chartType === 'area') {
      item.areaStyle = {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: COLORS[i % COLORS.length] + '99' },
          { offset: 1, color: COLORS[i % COLORS.length] + '08' },
        ]),
      }
    }

    if (config.stacked && (chartType === 'bar' || chartType === 'area')) {
      item.stack = 'total'
    }

    if (showLabels && (chartType === 'bar' || chartType === 'line')) {
      item.label = {
        show: true,
        position: chartType === 'bar' ? (isHorizontal ? 'right' : 'top') : 'top',
        color: labelColor,
        fontSize: 10,
        formatter: (p: any) => p.value,
      }
    }

    return item
  })

  return {
    color: COLORS,
    title: config.title
      ? { text: config.title, left: 'center', textStyle: { color: textColor, fontSize: 14, fontWeight: 600 } }
      : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: isDark ? 'rgba(30,30,40,0.95)' : 'rgba(255,255,255,0.95)',
      borderColor: axisColor,
      borderWidth: 1,
      textStyle: { color: textColor, fontSize: 12 },
    },
    legend: {
      data: config.yColumns,
      textStyle: { color: labelColor, fontSize: 11 },
      bottom: 0,
      type: config.yColumns.length > 4 ? 'scroll' : 'plain',
    },
    grid: {
      left: isHorizontal ? 80 : 50,
      right: showLabels ? 50 : 20,
      top: config.title ? 45 : 15,
      bottom: config.yColumns.length > 0 ? 40 : 25,
      containLabel: false,
    },
    xAxis: isHorizontal
      ? {
          type: 'value' as const,
          axisLabel: { color: labelColor, fontSize: 10 },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { lineStyle: { color: axisColor, opacity: 0.2 } },
          name: config.yColumns[0] || undefined,
          nameTextStyle: { color: labelColor, fontSize: 10 },
        }
      : {
          type: 'category' as const,
          data: xValues,
          axisLabel: {
            color: labelColor,
            fontSize: 10,
            rotate: xValues.length > 8 ? 35 : 0,
            interval: xValues.length > 20 ? Math.floor(xValues.length / 15) || 1 : 0,
          },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { show: false },
          axisTick: { alignWithLabel: true },
        },
    yAxis: isHorizontal
      ? {
          type: 'category' as const,
          data: xValues,
          axisLabel: {
            color: labelColor,
            fontSize: 10,
            interval: xValues.length > 20 ? Math.floor(xValues.length / 15) || 1 : 0,
          },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { show: false },
        }
      : {
          type: 'value' as const,
          axisLabel: { color: labelColor, fontSize: 10 },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: { lineStyle: { color: axisColor, opacity: 0.15 } },
          name: config.yColumns[0] || undefined,
          nameTextStyle: { color: labelColor, fontSize: 10 },
        },
    series,
    backgroundColor: bgColor,
  }
}
