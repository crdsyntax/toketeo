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

// Mock only the services; the STORE is the real Zustand+persist store so the
// add/update/remove tab transitions actually run the production code paths.
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
    // 1) open a table tab through the REAL store action
    act(() => {
      useAppStore.getState().addExplorerTab(fullTab('pg-id:public:users', 'pg-id', 'public', 'users'))
    })

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })

    // 2) close the last tab through the REAL store action
    act(() => {
      useAppStore.getState().removeExplorerTab('pg-id:public:users')
    })

    // 3) sidebar must keep the tables, sidebar must not reload
    expect(useAppStore.getState().explorer.activeExplorerTabId).toBeNull()
    expect(Object.keys(useAppStore.getState().explorerTabs)).toEqual([])
    expect(useAppStore.getState().lastExplorerContext).toEqual({ connectionId: 'pg-id', database: 'public' })
    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('pg-id')
      expect(result.current.currentSchema).toBe('public')
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })
    // only the first fetch, no refetch triggered by closing the tab
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

    // a stale tab persisted from a previous session (connection maria) plus the
    // tab the user is currently working on (connection pg)
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
    // the sidebar must keep showing pg, not jump back to the stale maria tab
    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('pg-id')
    })
    expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users'])
  })
})