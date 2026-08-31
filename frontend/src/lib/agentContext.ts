import { useAppStore } from '@/store/useAppStore'

export interface AgentOpenTab {
  id: string
  name: string
  connectionId?: string | null
  sqlPreview: string
  hasResults: boolean
  error?: string | null
  isActive: boolean
}

export interface AgentExplorerTab {
  id: string
  connectionId: string
  database: string
  objectName: string
  isActive: boolean
}

export interface AgentUiContext {
  route: string
  module: string
  activeConnectionId?: string | null
  database?: string | null
  openTabs: AgentOpenTab[]
  explorerTabs: AgentExplorerTab[]
  lastTabError?: string | null
}

const MODULE_LABELS: Record<string, string> = {
  '/query': 'SQL Editor',
  '/explorer': 'Data Explorer',
  '/assistant': 'AI Assistant',
  '/compare': 'Schema/Data Compare',
  '/sync': 'Cross-DB Sync',
  '/scheduler': 'Scheduler',
  '/monitor': 'Monitor',
  '/connections': 'Connections',
  '/audit': 'Audit Log',
  '/settings': 'Settings',
}

function moduleFromRoute(pathname: string): string {
  const base = '/' + pathname.replace(/^\/+/, '').split('/')[0]
  return MODULE_LABELS[base] ?? base
}



export function buildAgentContext(route: string): AgentUiContext {
  const app = useAppStore.getState()
  const activeConnection = app.activeConnection

  const openTabs: AgentOpenTab[] = app.tabs.map((t) => ({
    id: t.id,
    name: t.name,
    connectionId: t.connectionId ?? null,
    sqlPreview: t.query.slice(0, 500),
    hasResults: !!t.results,
    error: t.error ?? null,
    isActive: t.id === app.activeTabId,
  }))

  const explorerTabs: AgentExplorerTab[] = Object.entries(app.explorerTabs).map(([id, t]) => ({
    id,
    connectionId: t.connectionId,
    database: t.database,
    objectName: t.selectedItem?.name ?? '',
    isActive: id === app.explorer.activeExplorerTabId,
  }))

  const lastTabError =
    [...openTabs].reverse().find((t) => t.error)?.error ??
    null

  return {
    route,
    module: moduleFromRoute(route),
    activeConnectionId: activeConnection?.id ?? null,
    database: activeConnection?.database ?? null,
    openTabs,
    explorerTabs,
    lastTabError,
  }
}
