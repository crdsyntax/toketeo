import { useAppStore } from '@/store/useAppStore'



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
