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
    activeConnection: null,
    lastExplorerContext: null,
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

  it('closing the last tab keeps the connection context intact', () => {
    resetStore()
    useAppStore.getState().setActiveConnection({ id: 'maria', database: 'schema' } as never)
    useAppStore.getState().addExplorerTab(fullTab('maria:schema:orders', 'maria', 'schema', 'orders'))

    useAppStore.getState().removeExplorerTab('maria:schema:orders')

    const state = useAppStore.getState()
    expect(Object.keys(state.explorerTabs)).toEqual([])
    expect(state.explorer.activeExplorerTabId).toBeNull()
    // the active connection survives closing the last tab
    expect(state.activeConnection?.id).toBe('maria')
    expect(state.activeConnection?.database).toBe('schema')
  })

  it('persists the last explorer context when the last tab is closed', () => {
    resetStore()
    useAppStore.getState().addExplorerTab(fullTab('pg:public:users', 'pg', 'public', 'users'))

    useAppStore.getState().removeExplorerTab('pg:public:users')

    const state = useAppStore.getState()
    expect(Object.keys(state.explorerTabs)).toEqual([])
    expect(state.explorer.activeExplorerTabId).toBeNull()
    expect(state.lastExplorerContext).toEqual({ connectionId: 'pg', database: 'public' })
  })

  it('updates the last explorer context when a tab switches database', () => {
    resetStore()
    useAppStore.getState().addExplorerTab(fullTab('pg:d1:t1', 'pg', 'd1', 't1'))

    // double-click another schema: the active tab is re-pointed at the new db
    useAppStore.getState().updateExplorerTab('pg:d1:t1', {
      database: 'd2',
      selectedItem: { name: '', type: DatabaseObjectType.TRIGGER },
    })

    expect(useAppStore.getState().lastExplorerContext).toEqual({ connectionId: 'pg', database: 'd2' })
  })

  it('keeps a pre-existing last explorer context when a non-context tab change happens', () => {
    resetStore()
    useAppStore.getState().addExplorerTab(fullTab('pg:d1:t1', 'pg', 'd1', 't1'))
    useAppStore.getState().setLastExplorerContext({ connectionId: 'pg', database: 'd1' })

    // unrelated update (execution status) must not clear the context
    useAppStore.getState().updateExplorerTab('pg:d1:t1', { executionStatus: ExecutionStatus.IDLE })

    expect(useAppStore.getState().lastExplorerContext).toEqual({ connectionId: 'pg', database: 'd1' })
  })

  it('closing the last tab of a connection does not jump to another connection\'s persisted tabs', () => {
    resetStore()
    // stale tab persisted from a previous session (connection b)
    useAppStore.getState().addExplorerTab(fullTab('b:db:orders', 'b', 'db', 'orders'))
    // user is now working with connection a
    useAppStore.getState().addExplorerTab(fullTab('a:db:users', 'a', 'db', 'users'))

    useAppStore.getState().removeExplorerTab('a:db:users')

    const state = useAppStore.getState()
    expect(Object.keys(state.explorerTabs)).toEqual(['b:db:orders'])
    // must NOT auto-activate the other connection's tab
    expect(state.explorer.activeExplorerTabId).toBeNull()
    // the sidebar must keep showing the connection being worked on (a)
    expect(state.lastExplorerContext).toEqual({ connectionId: 'a', database: 'db' })
  })

  it('closing the active tab prefers a remaining tab of the same connection', () => {
    resetStore()
    useAppStore.getState().addExplorerTab(fullTab('b:db:products', 'b', 'db', 'products'))
    useAppStore.getState().addExplorerTab(fullTab('a:db:users', 'a', 'db', 'users'))
    useAppStore.getState().addExplorerTab(fullTab('a:db:orders', 'a', 'db', 'orders'))

    useAppStore.getState().removeExplorerTab('a:db:orders') // active tab

    const state = useAppStore.getState()
    expect(state.explorer.activeExplorerTabId).toBe('a:db:users')
    expect(state.lastExplorerContext).toEqual({ connectionId: 'a', database: 'db' })
  })

  it('switching the active connection focuses its own most recent explorer tab', () => {
    resetStore()
    useAppStore.getState().addExplorerTab(fullTab('a:db:users', 'a', 'db', 'users'))
    useAppStore.getState().addExplorerTab(fullTab('b:db:orders', 'b', 'db', 'orders'))

    useAppStore.getState().setActiveConnection({ id: 'b', database: 'db' } as never)

    expect(useAppStore.getState().explorer.activeExplorerTabId).toBe('b:db:orders')
  })

  it('switching the active connection to one without tabs clears the active tab but keeps the other tabs', () => {
    resetStore()
    useAppStore.getState().addExplorerTab(fullTab('a:db:users', 'a', 'db', 'users'))

    useAppStore.getState().setActiveConnection({ id: 'b', database: 'db' } as never)

    const state = useAppStore.getState()
    expect(state.explorer.activeExplorerTabId).toBeNull()
    expect(Object.keys(state.explorerTabs)).toEqual(['a:db:users'])
  })
})
