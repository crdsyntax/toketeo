import { renderHook, waitFor, act } from '@testing-library/react'
import { useExplorer } from './useExplorer'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { schemaService } from '@/services/schema.service'
import { connectionService } from '@/services/connection.service'
import { useAppStore } from '@/store/useAppStore'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ExecutionStatus, SidebarTab, ExplorerTab, DatabaseType, DatabaseObjectType, Environment } from '@/types/database'
import type { Connection } from '@/types/database'


vi.mock('@/services/schema.service')
vi.mock('@/services/connection.service')

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 1000 },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const pgConn: Connection = {
  id: 'pg-id',
  name: 'Postgres',
  type: DatabaseType.POSTGRES,
  environment: Environment.LOCAL,
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  database: 'public',
  createdAt: '',
  updatedAt: '',
}

const mongoConn: Connection = {
  id: 'mongo-id',
  name: 'MongoDB',
  type: DatabaseType.MONGODB,
  environment: Environment.LOCAL,
  host: 'localhost',
  port: 27017,
  user: 'root',
  database: 'mydb',
  createdAt: '',
  updatedAt: '',
}

const fullTab = (id: string, connectionId: string, database: string, name: string) => ({
  id,
  connectionId,
  database,
  selectedItem: { name, type: DatabaseObjectType.TABLE as DatabaseObjectType },
  activeTab: ExplorerTab.DATA,
  executionStatus: ExecutionStatus.IDLE,
  executionError: null,
  socketResults: null,
  page: 0,
  pageSize: 50,
  editableDdl: '',
  filter: '',
})

describe('useExplorer real-store integration: closing the last tab keeps the sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(connectionService.getAll).mockResolvedValue([pgConn])
    vi.mocked(schemaService.getTables).mockResolvedValue([
      { name: 'users', type: 'table' },
      { name: 'orders', type: 'table' },
    ])
    useAppStore.setState({
      activeConnection: pgConn,
      lastExplorerContext: { connectionId: 'pg-id', database: 'public' },
      explorer: { sidebarTab: SidebarTab.TABLES, search: '', activeExplorerTabId: null },
      explorerTabs: {},
    })
  })

  afterEach(() => {
    useAppStore.setState({
      activeConnection: null,
      lastExplorerContext: null,
      explorer: { sidebarTab: SidebarTab.TABLES, search: '', activeExplorerTabId: null },
      explorerTabs: {},
    })
  })

  it('keeps sidebar tables after the real removeExplorerTab runs on the last tab', async () => {

    act(() => {
      useAppStore.getState().addExplorerTab(fullTab('pg-id:public:users', 'pg-id', 'public', 'users'))
    })

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })


    act(() => {
      useAppStore.getState().removeExplorerTab('pg-id:public:users')
    })


    expect(useAppStore.getState().explorer.activeExplorerTabId).toBeNull()
    expect(Object.keys(useAppStore.getState().explorerTabs)).toEqual([])
    expect(useAppStore.getState().lastExplorerContext).toEqual({ connectionId: 'pg-id', database: 'public' })
    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('pg-id')
      expect(result.current.currentSchema).toBe('public')
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })

    expect(schemaService.getTables).toHaveBeenCalledTimes(1)
  })

  it('keeps sidebar tables after reload state (activeConnection null, context persisted)', async () => {
    act(() => {
      useAppStore.setState({
        activeConnection: null,
        lastExplorerContext: { connectionId: 'pg-id', database: 'public' },
        explorer: { sidebarTab: SidebarTab.TABLES, search: '', activeExplorerTabId: null },
        explorerTabs: {},
      })
    })

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('pg-id')
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })
  })

  it('ghost persisted connection (deleted) resolves to null and clears the sidebar', async () => {
    vi.mocked(connectionService.getAll).mockResolvedValue([])
    act(() => {
      useAppStore.setState({
        activeConnection: null,
        lastExplorerContext: { connectionId: 'deleted-id', database: 'public' },
        explorer: { sidebarTab: SidebarTab.TABLES, search: '', activeExplorerTabId: null },
        explorerTabs: {},
      })
    })

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.activeConnection).toBeNull()
    })
    expect(result.current.filteredItems).toEqual([])
  })

  it('closing the last tab of the current connection keeps the sidebar on it instead of a stale one', async () => {
    const mariaConn: Connection = {
      ...pgConn,
      id: 'maria-id',
      name: 'MariaDB',
      type: DatabaseType.MARIADB,
      database: 'schema',
    }
    vi.mocked(connectionService.getAll).mockResolvedValue([pgConn, mariaConn])
    vi.mocked(schemaService.getTables).mockResolvedValue([{ name: 'users', type: 'table' }])
    useAppStore.setState({
      activeConnection: pgConn,
      lastExplorerContext: { connectionId: 'pg-id', database: 'public' },
      explorer: { sidebarTab: SidebarTab.TABLES, search: '', activeExplorerTabId: null },
      explorerTabs: {},
    })


    act(() => {
      useAppStore.getState().addExplorerTab(fullTab('maria-id:schema:orders', 'maria-id', 'schema', 'orders'))
      useAppStore.getState().addExplorerTab(fullTab('pg-id:public:users', 'pg-id', 'public', 'users'))
    })

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('pg-id')
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users'])
    })

    act(() => {
      useAppStore.getState().removeExplorerTab('pg-id:public:users')
    })

    expect(useAppStore.getState().explorer.activeExplorerTabId).toBeNull()
    expect(useAppStore.getState().lastExplorerContext).toEqual({ connectionId: 'pg-id', database: 'public' })

    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('pg-id')
    })
    expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users'])
  })

  it('MongoDB: keeps sidebar collections after closing the last tab', async () => {
    vi.mocked(connectionService.getAll).mockResolvedValue([mongoConn])
    vi.mocked(schemaService.getTables).mockResolvedValue([
      { name: 'users', type: 'collection' },
      { name: 'orders', type: 'collection' },
    ])
    useAppStore.setState({
      activeConnection: mongoConn,
      lastExplorerContext: { connectionId: 'mongo-id', database: 'mydb' },
      explorer: { sidebarTab: SidebarTab.TABLES, search: '', activeExplorerTabId: null },
      explorerTabs: {},
    })

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })

    act(() => {
      useAppStore.getState().addExplorerTab(fullTab('mongo-id:mydb:users', 'mongo-id', 'mydb', 'users'))
    })

    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('mongo-id')
      expect(result.current.currentSchema).toBe('mydb')
    })

    act(() => {
      useAppStore.getState().removeExplorerTab('mongo-id:mydb:users')
    })

    expect(useAppStore.getState().explorer.activeExplorerTabId).toBeNull()
    expect(useAppStore.getState().lastExplorerContext).toEqual({ connectionId: 'mongo-id', database: 'mydb' })
    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('mongo-id')
      expect(result.current.currentSchema).toBe('mydb')
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })
    expect(schemaService.getTables).toHaveBeenCalledTimes(1)
  })

  it('MongoDB: real flow (double-click db slot -> select collection -> close last tab) keeps collections', async () => {

    const mongoConnNoDb: Connection = { ...mongoConn, database: undefined }
    vi.mocked(connectionService.getAll).mockResolvedValue([mongoConnNoDb])
    vi.mocked(schemaService.getTables).mockResolvedValue([
      { name: 'users', type: 'collection' },
      { name: 'orders', type: 'collection' },
    ])
    useAppStore.setState({
      activeConnection: null,
      lastExplorerContext: null,
      explorer: { sidebarTab: SidebarTab.TABLES, search: '', activeExplorerTabId: null },
      explorerTabs: {},
    })


    act(() => {
      const store = useAppStore.getState()
      store.setActiveConnection(mongoConnNoDb)
      store.setActiveConnectionDatabase('mydb')
      store.addExplorerTab({
        id: 'mongo-id:mydb:__db__',
        connectionId: 'mongo-id',
        database: 'mydb',
        selectedItem: { name: '', type: DatabaseObjectType.TRIGGER },
        activeTab: ExplorerTab.COLUMNS,
        executionStatus: ExecutionStatus.IDLE,
        executionError: null,
        socketResults: null,
        page: 0,
        pageSize: 50,
        editableDdl: '',
        filter: '',
      })
    })

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('mongo-id')
      expect(result.current.currentSchema).toBe('mydb')
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })


    act(() => {
      result.current.setSelectedItem({
        name: 'users',
        type: DatabaseObjectType.TABLE,
      })
    })

    await waitFor(() => {
      const state = useAppStore.getState()
      expect(Object.keys(state.explorerTabs)).toEqual(['mongo-id:mydb:users'])
      expect(state.explorer.activeExplorerTabId).toBe('mongo-id:mydb:users')
      expect(state.explorerTabs['mongo-id:mydb:users'].database).toBe('mydb')
    })


    act(() => {
      useAppStore.getState().removeExplorerTab('mongo-id:mydb:users')
    })

    expect(useAppStore.getState().explorer.activeExplorerTabId).toBeNull()
    expect(useAppStore.getState().lastExplorerContext).toEqual({ connectionId: 'mongo-id', database: 'mydb' })
    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('mongo-id')
      expect(result.current.currentSchema).toBe('mydb')
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })
  })

  it('MongoDB: switching via header tab to a connection with no database keeps the sidebar from lastExplorerContext', async () => {

    const mongoConnNoDb: Connection = { ...mongoConn, database: undefined }
    vi.mocked(connectionService.getAll).mockResolvedValue([mongoConnNoDb])
    vi.mocked(schemaService.getTables).mockResolvedValue([
      { name: 'users', type: 'collection' },
    ])
    useAppStore.setState({
      activeConnection: null,
      lastExplorerContext: { connectionId: 'mongo-id', database: 'mydb' },
      explorer: { sidebarTab: SidebarTab.TABLES, search: '', activeExplorerTabId: null },
      explorerTabs: {},
    })

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('mongo-id')
    })

    act(() => {
      result.current.switchExplorerConnection(mongoConnNoDb)
    })

    await waitFor(() => {
      expect(result.current.currentSchema).toBe('mydb')
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users'])
    })
  })

  it('MongoDB: open collection then close its last tab keeps collections (the reported repro)', async () => {

    const mongoConnNoDb: Connection = { ...mongoConn, database: undefined }
    vi.mocked(connectionService.getAll).mockResolvedValue([mongoConnNoDb])
    vi.mocked(schemaService.getTables).mockResolvedValue([
      { name: 'users', type: 'collection' },
      { name: 'orders', type: 'collection' },
    ])
    useAppStore.setState({
      activeConnection: null,
      lastExplorerContext: null,
      explorer: { sidebarTab: SidebarTab.TABLES, search: '', activeExplorerTabId: null },
      explorerTabs: {},
    })


    act(() => {
      const store = useAppStore.getState()
      store.setActiveConnection(mongoConnNoDb)
      store.setActiveConnectionDatabase('mydb')
      store.addExplorerTab({
        id: 'mongo-id:mydb:__db__',
        connectionId: 'mongo-id',
        database: 'mydb',
        selectedItem: { name: '', type: DatabaseObjectType.TRIGGER },
        activeTab: ExplorerTab.COLUMNS,
        executionStatus: ExecutionStatus.IDLE,
        executionError: null,
        socketResults: null,
        page: 0,
        pageSize: 50,
        editableDdl: '',
        filter: '',
      })
    })

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('mongo-id')
      expect(result.current.currentSchema).toBe('mydb')
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })


    act(() => {
      result.current.setSelectedItem({
        name: 'users',
        type: DatabaseObjectType.TABLE,
      })
    })

    await waitFor(() => {
      const state = useAppStore.getState()
      expect(Object.keys(state.explorerTabs)).toEqual(['mongo-id:mydb:users'])
      expect(state.explorerTabs['mongo-id:mydb:users'].database).toBe('mydb')
      expect(state.explorer.activeExplorerTabId).toBe('mongo-id:mydb:users')
    })


    act(() => {
      useAppStore.getState().removeExplorerTab('mongo-id:mydb:users')
    })

    expect(useAppStore.getState().explorer.activeExplorerTabId).toBeNull()
    expect(useAppStore.getState().lastExplorerContext).toEqual({ connectionId: 'mongo-id', database: 'mydb' })
    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('mongo-id')
      expect(result.current.currentSchema).toBe('mydb')
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })
  })

  it('MongoDB: lastExplorerContext from a DIFFERENT connection is not used when the Mongo connection has no database', async () => {

    const mongoConnNoDb: Connection = { ...mongoConn, database: undefined }
    vi.mocked(connectionService.getAll).mockResolvedValue([pgConn, mongoConnNoDb])
    vi.mocked(schemaService.getTables).mockResolvedValue([
      { name: 'users', type: 'collection' },
    ])
    useAppStore.setState({
      activeConnection: null,
      lastExplorerContext: { connectionId: 'pg-id', database: 'public' },
      explorer: { sidebarTab: SidebarTab.TABLES, search: '', activeExplorerTabId: null },
      explorerTabs: {},
    })

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })


    act(() => {
      result.current.switchExplorerConnection(mongoConnNoDb)
    })

    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('mongo-id')
    })

    expect(result.current.currentSchema).not.toBe('public')
    const lastCalls = vi.mocked(schemaService.getTables).mock.calls
    const mongoCall = lastCalls.find(([, schema]) => schema !== 'public')
    expect(mongoCall?.[0]).toBe('mongo-id')
  })
})