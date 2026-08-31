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
  executedAt: number
  durationMs?: number
  status: 'success' | 'error'
  error?: string
  rowCount?: number
}

export interface ExplorerTabState {
  id: string
  connectionId: string
  database: string
  selectedItem: DatabaseObject
  activeTab: ExplorerTab
  executionStatus: ExecutionStatus
  executionError: string | null
  socketResults: QueryResult | null
  page: number
  pageSize: number
  editableDdl: string
  filter: string
}

export interface CustomColors {
  primary: string
  secondary: string
  accent: string
  background: string
}

export const DEFAULT_EDITOR_FONT = "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Source Code Pro', Consolas, 'Courier New', monospace"

export interface AppState {
  theme: 'light' | 'dark' | 'paper'
  setTheme: (theme: 'light' | 'dark' | 'paper') => void
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
  lastExplorerContext: { connectionId: string; database: string } | null
  setLastExplorerContext: (ctx: { connectionId: string; database: string } | null) => void
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
    editorHeight: number
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
  queryHistory: Record<string, QueryHistoryEntry[]>
  addQueryHistory: (entry: QueryHistoryEntry) => void
  clearQueryHistory: (connectionId: string) => void
}
