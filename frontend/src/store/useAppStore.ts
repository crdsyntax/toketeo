import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Connection, QueryResult, DbValue, DatabaseObject } from '@/types/database'
import { ExecutionStatus, SidebarTab, ExplorerTab } from '@/types/database'

export type { DbValue }
export interface QueryTab {
  id: string
  name: string
  query: string
  results?: QueryResult | null
  status?: ExecutionStatus
  error?: string | null
}

interface AppState {
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
  accessToken: string | null
  setAccessToken: (token: string | null) => void
  activeConnection: Connection | null
  setActiveConnection: (connection: Connection | null) => void
  setActiveConnectionDatabase: (database: string) => void
  tabs: QueryTab[]
  activeTabId: string | null
  addTab: () => void
  openTab: (name: string, query: string) => void
  removeTab: (id: string) => void
  updateTabQuery: (id: string, query: string) => void
  updateTabResults: (id: string, updates: Partial<Pick<QueryTab, 'results' | 'status' | 'error'>>) => void
  clearTabResults: (id: string) => void
  setActiveTabId: (id: string) => void
  panels: {
    editor: boolean
    results: boolean
    editorHeight: number // percentage
  }
  setEditorHeight: (height: number) => void
  togglePanel: (panel: 'editor' | 'results') => void
  isSidebarOpen: boolean
  toggleSidebar: () => void
  explorer: {
    selectedItem: DatabaseObject | null
    sidebarTab: SidebarTab
    activeTab: ExplorerTab
    search: string
    executionStatus: ExecutionStatus
    executionError: string | null
    socketResults: QueryResult | null
  }
  setExplorerState: (state: Partial<AppState['explorer']>) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      accessToken: null,
      setAccessToken: (accessToken) => set({ accessToken }),
      activeConnection: null,
      setActiveConnection: (connection) => set({ activeConnection: connection }),
      setActiveConnectionDatabase: (database) => set((state) => ({
        activeConnection: state.activeConnection ? { ...state.activeConnection, database } : null
      })),
      tabs: [{ id: 'default', name: 'Query 1', query: 'SELECT * FROM tables LIMIT 10', status: ExecutionStatus.IDLE }],
      activeTabId: 'default',
      panels: { editor: true, results: true, editorHeight: 60 },
      setEditorHeight: (editorHeight) => set((state) => ({
        panels: { ...state.panels, editorHeight }
      })),
      togglePanel: (panel) => set((state) => ({
        panels: { ...state.panels, [panel]: !state.panels[panel] }
      })),
      isSidebarOpen: true,
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      explorer: {
        selectedItem: null,
        sidebarTab: SidebarTab.TABLES,
        activeTab: ExplorerTab.COLUMNS,
        search: '',
        executionStatus: ExecutionStatus.IDLE,
        executionError: null,
        socketResults: null
      },
      setExplorerState: (explorerState) => set((state) => ({
        explorer: { ...state.explorer, ...explorerState }
      })),
      addTab: () => set((state) => {
        const id = Math.random().toString(36).substring(7)
        return {
          tabs: [...state.tabs, { id, name: `Query ${state.tabs.length + 1}`, query: '', status: ExecutionStatus.IDLE }],
          activeTabId: id,
        }
      }),
      openTab: (name, query) => set((state) => {
        const id = Math.random().toString(36).substring(7)
        return {
          tabs: [...state.tabs, { id, name: name.replace(/\.sql$/i, ''), query, status: ExecutionStatus.IDLE }],
          activeTabId: id,
        }
      }),
      removeTab: (id) => set((state) => {
        const newTabs = state.tabs.filter((t) => t.id !== id)
        const defaultTab: QueryTab = { id: 'default', name: 'Query 1', query: '', status: ExecutionStatus.IDLE }
        return {
          tabs: newTabs.length ? newTabs : [defaultTab],
          activeTabId: state.activeTabId === id ? (newTabs[0]?.id || defaultTab.id) : state.activeTabId,
        }
      }),
      updateTabQuery: (id, query) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? { ...t, query } : t),
      })),
      updateTabResults: (id, updates) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? { ...t, ...updates } : t),
      })),
      clearTabResults: (id) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? { ...t, results: null, status: ExecutionStatus.IDLE, error: null } : t),
      })),
      setActiveTabId: (id) => set({ activeTabId: id }),
    }),
    {
      name: 'toketeo-app-storage',
      partialize: (state) => ({
        theme: state.theme,
        accessToken: state.accessToken,
        activeConnection: state.activeConnection,
        tabs: state.tabs.map(tab => ({ ...tab, results: null })),
        activeTabId: state.activeTabId,
        panels: state.panels,
        isSidebarOpen: state.isSidebarOpen,
        explorer: {
          selectedItem: state.explorer.selectedItem,
          sidebarTab: state.explorer.sidebarTab,
          activeTab: state.explorer.activeTab,
          search: state.explorer.search,
          executionStatus: state.explorer.executionStatus,
          executionError: state.explorer.executionError,
          // socketResults is NOT persisted
        },
      }),
    },
  ),
)
