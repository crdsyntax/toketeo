import { describe, it, expect } from 'vitest'
import { useAppStore } from '@/store/useAppStore'
import { ExecutionStatus, ExplorerTab, DatabaseObjectType } from '@/types/database'

const fullTab = (id: string, connectionId: string, database: string, name: string) => ({
  id,
  connectionId,
  database,
  selectedItem: { name, type: DatabaseObjectType.TABLE },
  activeTab: ExplorerTab.DATA,
  executionStatus: ExecutionStatus.IDLE,
  executionError: null,
  socketResults: null,
  page: 0,
  pageSize: 50,
  editableDdl: '',
  filter: '',
})

const resetStore = () => {
  useAppStore.setState({
    explorerTabs: {},
    explorer: { sidebarTab: 'tables' as never, search: '', activeExplorerTabId: null },
  })
}

describe('store tab flow', () => {
  it('does not recreate removed tabs when stale setters run', () => {
    resetStore()
    useAppStore.getState().addExplorerTab(fullTab('c:d1:t1', 'c', 'd1', 't1'))

    // double-click: in-place update of the active tab
    useAppStore.getState().updateExplorerTab('c:d1:t1', {
      database: 'd2',
      selectedItem: { name: '', type: DatabaseObjectType.TRIGGER },
    })

    // sidebar table click: handleSelectItem reuse (remove + add)
    useAppStore.getState().removeExplorerTab('c:d1:t1')
    useAppStore.getState().addExplorerTab(fullTab('c:d2:orders', 'c', 'd2', 'orders'))

    // stale sidebar setters hitting the removed tab id
    useAppStore.getState().updateExplorerTab('c:d1:t1', { executionStatus: ExecutionStatus.IDLE })
    useAppStore.getState().updateExplorerTab('c:d1:t1', { socketResults: null })
    useAppStore.getState().updateExplorerTab('c:d1:t1', { activeTab: ExplorerTab.DATA })

    const state = useAppStore.getState()
    expect(Object.keys(state.explorerTabs)).toEqual(['c:d2:orders'])
    expect(state.explorer.activeExplorerTabId).toBe('c:d2:orders')
    expect(state.explorerTabs['c:d2:orders'].selectedItem.name).toBe('orders')
  })

  it('reopens a previously open table after switching back to its DB', () => {
    resetStore()
    // initial: table t1 open in db1
    useAppStore.getState().addExplorerTab(fullTab('c:d1:t1', 'c', 'd1', 't1'))

    // double-click db2 -> in-place update active tab to empty slot for db2
    useAppStore.getState().updateExplorerTab('c:d1:t1', {
      database: 'd2',
      selectedItem: { name: '', type: DatabaseObjectType.TRIGGER },
    })
    // click orders in db2 -> reuse empty slot
    useAppStore.getState().removeExplorerTab('c:d1:t1')
    useAppStore.getState().addExplorerTab(fullTab('c:d2:orders', 'c', 'd2', 'orders'))
    useAppStore.getState().updateExplorerTab('c:d1:t1', { executionStatus: ExecutionStatus.IDLE })

    // double-click db1 -> update active tab (orders) in place to empty slot for db1
    useAppStore.getState().updateExplorerTab('c:d2:orders', {
      database: 'd1',
      selectedItem: { name: '', type: DatabaseObjectType.TRIGGER },
    })
    // click t1 in db1 -> its tab was removed, reuse empty slot
    useAppStore.getState().removeExplorerTab('c:d2:orders')
    useAppStore.getState().addExplorerTab(fullTab('c:d1:t1', 'c', 'd1', 't1'))

    const state = useAppStore.getState()
    expect(Object.keys(state.explorerTabs)).toEqual(['c:d1:t1'])
    expect(state.explorer.activeExplorerTabId).toBe('c:d1:t1')
    expect(state.explorerTabs['c:d1:t1'].database).toBe('d1')
    expect(state.explorerTabs['c:d1:t1'].selectedItem.name).toBe('t1')
  })

  it('updating a nonexistent tab does not create a partial tab', () => {
    resetStore()
    useAppStore.getState().updateExplorerTab('ghost', { database: 'x' })
    expect(Object.keys(useAppStore.getState().explorerTabs)).toEqual([])
  })

  it('disconnect removes tabs of that connection and keeps other tabs active', () => {
    resetStore()
    // mongo collection + mariadb table open
    useAppStore.getState().addExplorerTab(fullTab('mongo:dbs:users', 'mongo', 'dbs', 'users'))
    useAppStore.getState().addExplorerTab(fullTab('maria:schema:orders', 'maria', 'schema', 'orders'))

    // disconnect mariadb (active tab belongs to it)
    useAppStore.getState().removeExplorerTabsForConnection('maria')

    const state = useAppStore.getState()
    expect(Object.keys(state.explorerTabs)).toEqual(['mongo:dbs:users'])
    expect(state.explorer.activeExplorerTabId).toBe('mongo:dbs:users')
  })

  it('disconnect clears explorer state when it was the last connection with tabs', () => {
    resetStore()
    useAppStore.getState().addExplorerTab(fullTab('mongo:dbs:users', 'mongo', 'dbs', 'users'))

    useAppStore.getState().removeExplorerTabsForConnection('mongo')

    const state = useAppStore.getState()
    expect(Object.keys(state.explorerTabs)).toEqual([])
    expect(state.explorer.activeExplorerTabId).toBeNull()
  })

  it('reconnecting does not resurrect tabs of a disconnected connection', () => {
    resetStore()
    useAppStore.getState().addExplorerTab(fullTab('maria:schema:orders', 'maria', 'schema', 'orders'))

    useAppStore.getState().removeExplorerTabsForConnection('maria')
    // reconnect another connection: no stale tabs remain
    const state = useAppStore.getState()
    expect(state.explorerTabs['maria:schema:orders']).toBeUndefined()
    expect(state.explorer.activeExplorerTabId).toBeNull()
  })
})
