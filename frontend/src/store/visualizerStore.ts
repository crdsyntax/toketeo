import { create } from 'zustand'

export type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'doughnut'

export interface ChartConfig {
  chartType: ChartType
  xColumn: string | null
  yColumns: string[]
  groupColumn: string | null
  orientation: 'vertical' | 'horizontal'
  stacked: boolean
  title: string
}

interface VisualizerState {
  configs: Record<string, ChartConfig>
  setConfig: (tabId: string, config: Partial<ChartConfig>) => void
  resetConfig: (tabId: string) => void
}

const DEFAULTS: ChartConfig = {
  chartType: 'bar',
  xColumn: null,
  yColumns: [],
  groupColumn: null,
  orientation: 'vertical',
  stacked: false,
  title: '',
}

export const useVisualizerStore = create<VisualizerState>((set) => ({
  configs: {},
  setConfig: (tabId, config) =>
    set((s) => ({
      configs: {
        ...s.configs,
        [tabId]: { ...(s.configs[tabId] ?? DEFAULTS), ...config },
      },
    })),
  resetConfig: (tabId) =>
    set((s) => {
      const next = { ...s.configs }
      delete next[tabId]
      return { configs: next }
    }),
}))
