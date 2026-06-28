import type { ChartType } from '@/store/visualizerStore'

export interface ChartTypeMeta {
  id: ChartType
  label: string
  icon: string
  requiresX: boolean
  requiresY: boolean
  supportsGroup: boolean
  supportsStack: boolean
  supportsOrientation: boolean
}

export const CHART_TYPES: ChartTypeMeta[] = [
  {
    id: 'bar',
    label: 'Bar',
    icon: 'BarChart3',
    requiresX: true,
    requiresY: true,
    supportsGroup: true,
    supportsStack: true,
    supportsOrientation: true,
  },
  {
    id: 'line',
    label: 'Line',
    icon: 'TrendingUp',
    requiresX: true,
    requiresY: true,
    supportsGroup: true,
    supportsStack: false,
    supportsOrientation: false,
  },
  {
    id: 'pie',
    label: 'Pie',
    icon: 'PieChart',
    requiresX: true,
    requiresY: true,
    supportsGroup: false,
    supportsStack: false,
    supportsOrientation: false,
  },
  {
    id: 'area',
    label: 'Area',
    icon: 'AreaChart',
    requiresX: true,
    requiresY: true,
    supportsGroup: true,
    supportsStack: true,
    supportsOrientation: false,
  },
  {
    id: 'scatter',
    label: 'Scatter',
    icon: 'ScatterChart',
    requiresX: true,
    requiresY: true,
    supportsGroup: false,
    supportsStack: false,
    supportsOrientation: false,
  },
  {
    id: 'doughnut',
    label: 'Doughnut',
    icon: 'Circle',
    requiresX: true,
    requiresY: true,
    supportsGroup: false,
    supportsStack: false,
    supportsOrientation: false,
  },
]

export function getChartMeta(type: ChartType): ChartTypeMeta {
  return CHART_TYPES.find((c) => c.id === type) ?? CHART_TYPES[0]
}
