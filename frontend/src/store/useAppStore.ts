import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Connection, QueryResult } from '@/types/database'

export interface Tab {
  id: string
  name: string
  query: string
  results?: QueryResult | null
  status?: 'idle' | 'executing' | 'success' | 'error'
  error?: string | null
}

interface AppState {
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
  activeConnection: Connection | null
  setActiveConnection: (connection: Connection | null) => void
  setActiveConnectionDatabase: (database: string) => void
  tabs: Tab[]
  activeTabId: string | null
  addTab: () => void
  removeTab: (id: string) => void
  updateTabQuery: (id: string, query: string) => void
  updateTabResults: (id: string, updates: Partial<Pick<Tab, 'results' | 'status' | 'error'>>) => void
  setActiveTabId: (id: string) => void
  panels: {
    editor: boolean
    results: boolean
  }
  togglePanel: (panel: 'editor' | 'results') => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      activeConnection: null,
      setActiveConnection: (connection) => set({ activeConnection: connection }),
      setActiveConnectionDatabase: (database) => set((state) => ({
        activeConnection: state.activeConnection ? { ...state.activeConnection, database } : null
      })),
      tabs: [{ id: 'default', name: 'Query 1', query: 'SELECT * FROM tables LIMIT 10', status: 'idle' }],
      activeTabId: 'default',
      panels: { editor: true, results: true },
      togglePanel: (panel) => set((state) => ({
        panels: { ...state.panels, [panel]: !state.panels[panel] }
      })),
      addTab: () => set((state) => {
        const id = Math.random().toString(36).substring(7)
        return {
          tabs: [...state.tabs, { id, name: `Query ${state.tabs.length + 1}`, query: '', status: 'idle' }],
          activeTabId: id,
        }
      }),
      removeTab: (id) => set((state) => {
        const newTabs = state.tabs.filter((t) => t.id !== id)
        return {
          tabs: newTabs.length ? newTabs : [{ id: 'default', name: 'Query 1', query: '', status: 'idle' }],
          activeTabId: state.activeTabId === id ? (newTabs[0]?.id || 'default') : state.activeTabId,
        }
      }),
      updateTabQuery: (id, query) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? { ...t, query } : t),
      })),
      updateTabResults: (id, updates) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? { ...t, ...updates } : t),
      })),
      setActiveTabId: (id) => set({ activeTabId: id }),
    }),
    {
      name: 'toketeo-app-storage',
    },
  ),
)
