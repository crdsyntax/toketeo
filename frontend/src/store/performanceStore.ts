import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface QueryPerformanceRecord {
  id: string
  connectionId: string
  sql: string
  durationMs: number
  rowsReturned: number
  executedAt: number
  explainPlan?: string
  tableScans?: string[]
  missingIndexes?: string[]
}

interface PerformanceState {
  history: QueryPerformanceRecord[]
  addRecord: (record: QueryPerformanceRecord) => void
  clearHistory: () => void
  clearConnectionHistory: (connectionId: string) => void
}

const MAX_RECORDS = 500

export const usePerformanceStore = create<PerformanceState>()(
  persist(
    (set) => ({
      history: [],

      addRecord: (record) => set((s) => ({
        history: [record, ...s.history].slice(0, MAX_RECORDS),
      })),

      clearHistory: () => set({ history: [] }),

      clearConnectionHistory: (connectionId) => set((s) => ({
        history: s.history.filter((r) => r.connectionId !== connectionId),
      })),
    }),
    { name: 'toketeo-performance-storage' },
  ),
)
