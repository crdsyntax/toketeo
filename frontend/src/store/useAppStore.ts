import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Connection, QueryResult, DbValue, DatabaseObject } from '@/types/database'
import { ExecutionStatus, SidebarTab, ExplorerTab } from '@/types/database'

export type { DbValue }
export interface MongoFilterState {
  find: string
  project: string
  sort: string
  collation: string
  hint: string
}

export interface QueryTab {
  id: string
  name: string
  query: string
  connectionId?: string
  results?: QueryResult | null
  status?: ExecutionStatus
  error?: string | null
  editorViewState?: import('monaco-editor').editor.ICodeEditorViewState | null
  mongoFilter?: MongoFilterState
}

export interface QueryHistoryEntry {
  id: string
  query: string
  connectionId: string
  executedAt: number // epoch ms
  durationMs?: number
  status: 'success' | 'error'
  error?: string
  rowCount?: number
}

export interface ExplorerTabState {
  id: string; // connectionId:database:name
  selectedItem: DatabaseObject;
  activeTab: ExplorerTab;
  executionStatus: ExecutionStatus;
  executionError: string | null;
  socketResults: QueryResult | null;
  page: number;
  pageSize: number;
  editableDdl: string;
  filter: string;
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
  addTab: (connectionId?: string) => void
  openTab: (name: string, query: string, connectionId?: string) => void
  removeTab: (id: string) => void
  updateTabQuery: (id: string, query: string) => void
  updateTabConnection: (id: string, connectionId: string) => void
  updateTabResults: (id: string, updates: Partial<Pick<QueryTab, 'results' | 'status' | 'error'>>) => void
  clearTabResults: (id: string) => void
  setActiveTabId: (id: string) => void
  updateTabViewState: (id: string, viewState: import('monaco-editor').editor.ICodeEditorViewState | null) => void
  updateTabMongoFilter: (id: string, filter: Partial<MongoFilterState>) => void
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
    sidebarTab: SidebarTab
    search: string
    activeExplorerTabId: string | null
  }
  explorerTabs: Record<string, ExplorerTabState>
  setExplorerState: (state: Partial<AppState['explorer']>) => void
  addExplorerTab: (tab: ExplorerTabState) => void
  updateExplorerTab: (id: string, updates: Partial<ExplorerTabState>) => void
  removeExplorerTab: (id: string) => void
  miniToasts: Record<string, { type: 'success' | 'error', text: string } | null>
  setMiniToast: (id: string, msg: { type: 'success' | 'error', text: string }) => void
  clearMiniToast: (id: string) => void
  queryHistory: Record<string, QueryHistoryEntry[]> // keyed by connectionId
  addQueryHistory: (entry: QueryHistoryEntry) => void
  clearQueryHistory: (connectionId: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      accessToken: null,
      setAccessToken: (accessToken) => set({ accessToken }),
      activeConnection: null,
      setActiveConnection: (connection) => set((state) => {
        const updatedTabs = state.tabs.map(tab => {
          if (!tab.connectionId && connection) {
            return { ...tab, connectionId: connection.id }
          }
          return tab
        })
        return { activeConnection: connection, tabs: updatedTabs }
      }),
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
        sidebarTab: SidebarTab.TABLES,
        search: '',
        activeExplorerTabId: null
      },
      explorerTabs: {},
      setExplorerState: (explorerState) => set((state) => ({
        explorer: { ...state.explorer, ...explorerState }
      })),
      addExplorerTab: (tab) => set((state) => ({
        explorerTabs: { ...state.explorerTabs, [tab.id]: tab },
        explorer: { ...state.explorer, activeExplorerTabId: tab.id }
      })),
      updateExplorerTab: (id, updates) => set((state) => ({
        explorerTabs: {
          ...state.explorerTabs,
          [id]: { ...state.explorerTabs[id], ...updates }
        }
      })),
      removeExplorerTab: (id) => set((state) => {
        const remainingTabs = Object.fromEntries(
          Object.entries(state.explorerTabs).filter(([tabId]) => tabId !== id)
        )
        let nextActiveId = state.explorer.activeExplorerTabId
        if (nextActiveId === id) {
          const tabIds = Object.keys(remainingTabs)
          nextActiveId = tabIds.length > 0 ? tabIds[tabIds.length - 1] : null
        }
        return {
          explorerTabs: remainingTabs,
          explorer: { ...state.explorer, activeExplorerTabId: nextActiveId }
        }
      }),
      addTab: (connectionId?: string) => set((state) => {
        const id = Math.random().toString(36).substring(7)
        return {
          tabs: [...state.tabs, { 
            id, 
            name: `Query ${state.tabs.length + 1}`, 
            query: '', 
            connectionId: connectionId || state.activeConnection?.id,
            status: ExecutionStatus.IDLE 
          }],
          activeTabId: id,
        }
      }),
      openTab: (name, query, connectionId?: string) => set((state) => {
        const id = Math.random().toString(36).substring(7)
        return {
          tabs: [...state.tabs, { 
            id, 
            name: name.replace(/\.sql$/i, ''), 
            query, 
            connectionId: connectionId || state.activeConnection?.id,
            status: ExecutionStatus.IDLE 
          }],
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
      updateTabConnection: (id, connectionId) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? { ...t, connectionId } : t),
      })),
      updateTabResults: (id, updates) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? { ...t, ...updates } : t),
      })),
      clearTabResults: (id) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? { ...t, results: null, status: ExecutionStatus.IDLE, error: null } : t),
      })),
      setActiveTabId: (id) => set({ activeTabId: id }),
      updateTabViewState: (id, viewState) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? { ...t, editorViewState: viewState } : t),
      })),
      updateTabMongoFilter: (id, filter) => set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === id
            ? { ...t, mongoFilter: { ...(t.mongoFilter ?? { find: '', project: '', sort: '', collation: '', hint: '' }), ...filter } }
            : t
        ),
      })),
      miniToasts: {},
      setMiniToast: (id, msg) => {
        set((state) => ({ miniToasts: { ...state.miniToasts, [id]: msg } }), false)
        setTimeout(() => {
          set((state) => ({ miniToasts: { ...state.miniToasts, [id]: null } }), false)
        }, 3000)
      },
      clearMiniToast: (id) => set((state) => ({ miniToasts: { ...state.miniToasts, [id]: null } }), false),
      queryHistory: {},
      addQueryHistory: (entry) => set((state) => {
        const MAX_HISTORY = 100;
        const prev = state.queryHistory[entry.connectionId] ?? [];
        const updated = [entry, ...prev].slice(0, MAX_HISTORY);
        return { queryHistory: { ...state.queryHistory, [entry.connectionId]: updated } };
      }),
      clearQueryHistory: (connectionId) => set((state) => ({
        queryHistory: { ...state.queryHistory, [connectionId]: [] }
      })),
    }),
    {
      name: 'toketeo-app-storage',
      partialize: (state: AppState): AppState => ({
        ...state,
        theme: state.theme,
        accessToken: state.accessToken,
        activeConnection: state.activeConnection ? { ...state.activeConnection, password: undefined } : null,
        tabs: state.tabs.map(tab => ({ ...tab, results: null })),
        activeTabId: state.activeTabId,
        panels: state.panels,
        isSidebarOpen: state.isSidebarOpen,
        explorer: {
          sidebarTab: state.explorer.sidebarTab,
          search: state.explorer.search,
          activeExplorerTabId: state.explorer.activeExplorerTabId,
        },
        explorerTabs: Object.fromEntries(
          Object.entries(state.explorerTabs).map(([id, tab]) => [
            id,
            { ...tab, socketResults: null, filter: '' }
          ])
        ),
        queryHistory: state.queryHistory,
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        const persisted = persistedState as Record<string, unknown> & { version?: number };
        if (version < 1) {
          const explorer = persisted.explorer as { sidebarTab?: string } | undefined
          if (explorer && !Object.values(SidebarTab).includes(explorer.sidebarTab as SidebarTab)) {
            explorer.sidebarTab = SidebarTab.TABLES
          }
        }
        return persisted as unknown as AppState
      },
    },
  ),
)
