import { useAppStore } from '@/store/useAppStore'

/**
 * When the SQL editor page is active, open a new script tab bound to the given
 * connection — or activate an existing script already bound to it. Never
 * rewrites the connection of other script tabs.
 */
export function openScriptTabForConnection(connectionId: string, database?: string): void {
  if (window.location.pathname !== '/query') return
  const { tabs, setActiveTabId, addTab } = useAppStore.getState()
  const existing = tabs.find((t) => t.connectionId === connectionId)
  if (existing) {
    setActiveTabId(existing.id)
    return
  }
  addTab(connectionId, database)
}
