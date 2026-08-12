import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Connection, QueryResult, DbValue, DatabaseObject } from '@/types/database'
import { ExecutionStatus, SidebarTab, ExplorerTab } from '@/types/database'
import type { AccentPalette } from '@/lib/themes'

export type { DbValue }
export interface MongoFilterState {
  find: string
  project: string
  sort: string
  collation: string
  hint: string
}

export type EditorMode = 'auto' | 'mongosh' | 'json'

export type DataTabViewMode = 'table' | 'list' | 'json'

export interface EditorViewState {
  scrollTop?: number
  selection?: { anchor?: number; head?: number }
}

export interface QueryTab {
  id: string
  name: string
  query: string
  connectionId?: string
  results?: QueryResult | null
  status?: ExecutionStatus
  error?: string | null
  editorViewState?: EditorViewState | null
  mongoFilter?: MongoFilterState
  editorMode?: EditorMode
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
  connectionId: string;
  database: string;
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

export interface CustomColors {
  primary: string
  secondary: string
  accent: string
  background: string
}

export const DEFAULT_EDITOR_FONT = "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Source Code Pro', Consolas, 'Courier New', monospace"

interface AppState {
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
  lightColors: CustomColors | null
  setLightColors: (colors: Partial<CustomColors> | null) => void
  darkColors: CustomColors | null
  setDarkColors: (colors: Partial<CustomColors> | null) => void
  editorFontFamily: string
  setEditorFontFamily: (font: string) => void
  inlineEditReview: boolean
  setInlineEditReview: (enabled: boolean) => void
  dataTabViewMode: DataTabViewMode
  setDataTabViewMode: (mode: DataTabViewMode) => void
  resultsFontSize: number
  setResultsFontSize: (size: number) => void
  uiFontSize: number
  setUiFontSize: (size: number) => void
  editorLineHeight: number
  setEditorLineHeight: (lh: number) => void
  editorTabSize: number
  setEditorTabSize: (size: number) => void
  editorMinimap: boolean
  setEditorMinimap: (show: boolean) => void
  uiFontFamily: string
  setUiFontFamily: (font: string) => void
  borderRadius: number
  setBorderRadius: (radius: number) => void
  accentPalette: AccentPalette
  setAccentPalette: (palette: AccentPalette) => void
  accessToken: string | null
  setAccessToken: (token: string | null) => void
  activeConnection: Connection | null
  setActiveConnection: (connection: Connection | null) => void
  setActiveConnectionDatabase: (database: string) => void
  connectedConnectionIds: string[]
  setConnectedConnection: (id: string) => void
  removeConnectedConnection: (id: string) => void
  tabs: QueryTab[]
  activeTabId: string | null
  addTab: (connectionId?: string, database?: string) => void
  openTab: (name: string, query: string, connectionId?: string) => void
  removeTab: (id: string) => void
  updateTabQuery: (id: string, query: string) => void
  updateTabConnection: (id: string, connectionId: string) => void
  updateTabResults: (id: string, updates: Partial<Pick<QueryTab, 'results' | 'status' | 'error'>>) => void
  clearTabResults: (id: string) => void
  setActiveTabId: (id: string) => void
  updateTabViewState: (id: string, viewState: EditorViewState | null) => void
  updateTabMongoFilter: (id: string, filter: Partial<MongoFilterState>) => void
  updateTabEditorMode: (id: string, mode: EditorMode) => void
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
  removeExplorerTabsForConnection: (connectionId: string) => void
  miniToasts: Record<string, { type: 'success' | 'error', text: string } | null>
  setMiniToast: (id: string, msg: { type: 'success' | 'error', text: string }) => void
  clearMiniToast: (id: string) => void
  connectionErrors: Record<string, string | null>
  setConnectionError: (id: string, error: string | null) => void
  clearConnectionError: (id: string) => void
  queryHistory: Record<string, QueryHistoryEntry[]> // keyed by connectionId
  addQueryHistory: (entry: QueryHistoryEntry) => void
  clearQueryHistory: (connectionId: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      lightColors: null,
      setLightColors: (colors) => set(() => ({
        lightColors: colors as CustomColors | null,
      })),
      darkColors: null,
      setDarkColors: (colors) => set(() => ({
        darkColors: colors as CustomColors | null,
      })),
      editorFontFamily: DEFAULT_EDITOR_FONT,
      setEditorFontFamily: (editorFontFamily) => set({ editorFontFamily }),
      inlineEditReview: true,
      setInlineEditReview: (inlineEditReview) => set({ inlineEditReview }),
      dataTabViewMode: 'table',
      setDataTabViewMode: (dataTabViewMode) => set({ dataTabViewMode }),
      resultsFontSize: 13,
      setResultsFontSize: (resultsFontSize) => set({ resultsFontSize }),
      editorLineHeight: 1.6,
      setEditorLineHeight: (editorLineHeight) => set({ editorLineHeight }),
      editorTabSize: 2,
      setEditorTabSize: (editorTabSize) => set({ editorTabSize }),
      editorMinimap: false,
      setEditorMinimap: (editorMinimap) => set({ editorMinimap }),
      uiFontFamily: "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif",
      setUiFontFamily: (uiFontFamily) => set({ uiFontFamily }),
      uiFontSize: 13,
      setUiFontSize: (uiFontSize) => set({ uiFontSize }),
      borderRadius: 6,
      setBorderRadius: (borderRadius) => set({ borderRadius }),
      accentPalette: 'emerald',
      setAccentPalette: (accentPalette) => set({ accentPalette }),
      accessToken: null,
      setAccessToken: (accessToken) => set({ accessToken }),
      activeConnection: null,
      setActiveConnection: (connection) => set((state) => {
        const switchingConnection = connection && connection.id !== state.activeConnection?.id
        const explorer = switchingConnection
          ? { ...state.explorer, activeExplorerTabId: null }
          : state.explorer
        return { activeConnection: connection, explorer }
      }),
      setActiveConnectionDatabase: (database) => set((state) => ({
        activeConnection: state.activeConnection ? { ...state.activeConnection, database } : null
      })),
      connectedConnectionIds: [],
      setConnectedConnection: (id) => set((state) => {
        if (state.connectedConnectionIds.includes(id)) return state
        return { connectedConnectionIds: [...state.connectedConnectionIds, id] }
      }),
      removeConnectedConnection: (id) => set((state) => ({
        connectedConnectionIds: state.connectedConnectionIds.filter((cid) => cid !== id)
      })),
      tabs: [{ id: 'default', name: 'Query 1', query: 'SELECT * FROM tables LIMIT 10', status: ExecutionStatus.IDLE, editorMode: 'auto' }],
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
      updateExplorerTab: (id, updates) => set((state) => {
        if (!state.explorerTabs[id]) return state
        return {
          explorerTabs: {
            ...state.explorerTabs,
            [id]: { ...state.explorerTabs[id], ...updates }
          }
        }
      }),
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
      removeExplorerTabsForConnection: (connectionId) => set((state) => {
        const remainingTabs = Object.fromEntries(
          Object.entries(state.explorerTabs).filter(([, tab]) => tab.connectionId !== connectionId)
        )
        let nextActiveId = state.explorer.activeExplorerTabId
        if (nextActiveId && state.explorerTabs[nextActiveId]?.connectionId === connectionId) {
          const tabIds = Object.keys(remainingTabs)
          nextActiveId = tabIds.length > 0 ? tabIds[tabIds.length - 1] : null
        }
        return {
          explorerTabs: remainingTabs,
          explorer: { ...state.explorer, activeExplorerTabId: nextActiveId }
        }
      }),
      addTab: (connectionId?: string, database?: string) => set((state) => {
        const id = Math.random().toString(36).substring(7)
        const effectiveConnId = connectionId || state.activeConnection?.id
        let updatedActive = state.activeConnection
        if (database && effectiveConnId) {
          if (state.activeConnection?.id === effectiveConnId) {
            updatedActive = { ...state.activeConnection, database }
          } else {
            updatedActive = { id: effectiveConnId, database } as Connection
          }
        }
        return {
          tabs: [...state.tabs, { 
            id, 
            name: `Query ${state.tabs.length + 1}`, 
            query: '', 
            connectionId: effectiveConnId,
            status: ExecutionStatus.IDLE,
            editorMode: 'auto',
          }],
          activeTabId: id,
          activeConnection: updatedActive,
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
            status: ExecutionStatus.IDLE,
            editorMode: 'auto',
          }],
          activeTabId: id,
        }
      }),
      removeTab: (id) => set((state) => {
        const newTabs = state.tabs.filter((t) => t.id !== id)
        const defaultTab: QueryTab = { id: 'default', name: 'Query 1', query: '', status: ExecutionStatus.IDLE, editorMode: 'auto' }
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
      updateTabEditorMode: (id, editorMode) => set((state) => ({
        tabs: state.tabs.map((t) => t.id === id ? { ...t, editorMode } : t),
      })),
      miniToasts: {},
      setMiniToast: (id, msg) => {
        set((state) => ({ miniToasts: { ...state.miniToasts, [id]: msg } }), false)
        setTimeout(() => {
          set((state) => ({ miniToasts: { ...state.miniToasts, [id]: null } }), false)
        }, 3000)
      },
      clearMiniToast: (id) => set((state) => ({ miniToasts: { ...state.miniToasts, [id]: null } }), false),
      connectionErrors: {},
      setConnectionError: (id, error) => set((state) => ({
        connectionErrors: { ...state.connectionErrors, [id]: error }
      })),
      clearConnectionError: (id) => set((state) => ({
        connectionErrors: { ...state.connectionErrors, [id]: null }
      })),
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
        connectionErrors: {},
        connectedConnectionIds: [],
        theme: state.theme,
        lightColors: state.lightColors,
        darkColors: state.darkColors,
        accentPalette: state.accentPalette,
        accessToken: state.accessToken,
        activeConnection: null,
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
      version: 4,
      migrate: (persistedState: unknown, version: number) => {
        const persisted = persistedState as Record<string, unknown> & { version?: number };
        if (version < 1) {
          const explorer = persisted.explorer as { sidebarTab?: string } | undefined
          if (explorer && !Object.values(SidebarTab).includes(explorer.sidebarTab as SidebarTab)) {
            explorer.sidebarTab = SidebarTab.TABLES
          }
        }
        if (version < 2) {
          persisted.connectedConnectionIds = []
          persisted.activeConnection = null
        }
        if (version < 3) {
          const oldColors = persisted.customColors as CustomColors | undefined
          if (oldColors) {
            persisted.lightColors = oldColors
            persisted.darkColors = oldColors
          }
          delete persisted.customColors
          delete persisted.setCustomColors
        }
        if (version < 4) {
          const tabs = persisted.explorerTabs as Record<string, Partial<ExplorerTabState>> | undefined
          if (tabs) {
            for (const [id, tab] of Object.entries(tabs)) {
              const [connId, db] = id.split(':')
              if (!tab.connectionId && connId) tab.connectionId = connId
              if (!tab.database && db) tab.database = db
            }
          }
        }
        return persisted as unknown as AppState
      },
    },
  ),
)
