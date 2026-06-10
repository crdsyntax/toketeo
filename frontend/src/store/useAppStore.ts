import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Connection } from '@/types/database'

interface Tab {
  id: string
  name: string
  query: string
}

interface AppState {
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
  activeConnection: Connection | null
  setActiveConnection: (connection: Connection | null) => void
  tabs: Tab[]
  activeTabId: string | null
  addTab: () => void
  removeTab: (id: string) => void
  updateTabQuery: (id: string, query: string) => void
  setActiveTabId: (id: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      activeConnection: null,
      setActiveConnection: (connection) => set({ activeConnection: connection }),
      tabs: [{ id: 'default', name: 'Query 1', query: 'SELECT * FROM tables LIMIT 10' }],
      activeTabId: 'default',
      addTab: () => set((state) => {
        const id = Math.random().toString(36).substring(7)
        return {
          tabs: [...state.tabs, { id, name: `Query ${state.tabs.length + 1}`, query: '' }],
          activeTabId: id,
        }
      }),
      removeTab: (id) => set((state) => {
        const newTabs = state.tabs.filter((t) => t.id !== id)
        return {
          tabs: newTabs.length ? newTabs : [{ id: 'default', name: 'Query 1', query: '' }],
          activeTabId: state.activeTabId === id ? (newTabs[0]?.id || 'default') : state.activeTabId,
        }
      }),
      updateTabQuery: (id, query) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? { ...t, query } : t),
      })),
      setActiveTabId: (id) => set({ activeTabId: id }),
    }),
    {
      name: 'toketeo-app-storage',
    },
  ),
)
