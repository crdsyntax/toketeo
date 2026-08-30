import { renderHook, waitFor } from '@testing-library/react'
import { useExplorer } from './useExplorer'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { schemaService } from '@/services/schema.service'
import { connectionService } from '@/services/connection.service'
import { useAppStore } from '@/store/useAppStore'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ExecutionStatus, SidebarTab, ExplorerTab, DatabaseType, Environment } from '@/types/database'
import type { Connection } from '@/types/database'

// Mock the store and service
vi.mock('@/store/useAppStore')
vi.mock('@/services/schema.service')
vi.mock('@/services/connection.service')

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 1000,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useExplorer Performance and Caching', () => {
  const mockActiveConnection = { id: 'test-id', database: 'test-db' }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(connectionService.getAll).mockResolvedValue([{
      id: 'test-id',
      name: 'Test',
      type: DatabaseType.POSTGRES,
      environment: Environment.LOCAL,
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      database: 'test-db',
      createdAt: '',
      updatedAt: '',
    }])
    vi.mocked(useAppStore).mockReturnValue({
      activeConnection: mockActiveConnection,
      explorer: {
        selectedItem: null,
        sidebarTab: SidebarTab.TABLES,
        activeTab: ExplorerTab.COLUMNS,
        search: '',
        executionStatus: ExecutionStatus.IDLE,
        executionError: null,
        socketResults: null,
        activeExplorerTabId: 'test-id:test-db:table1',
      },
      explorerTabs: {
        'test-id:test-db:table1': {
          id: 'test-id:test-db:table1',
          connectionId: 'test-id',
          database: 'test-db',
          selectedItem: { name: 'table1', type: 'table' },
          activeTab: ExplorerTab.DATA,
          executionStatus: ExecutionStatus.IDLE,
          executionError: null,
          socketResults: null,
          page: 0,
          pageSize: 50,
          editableDdl: '',
          filter: '',
        },
      },
      setExplorerState: vi.fn(),
      updateExplorerTab: vi.fn(),
      addExplorerTab: vi.fn(),
      removeExplorerTab: vi.fn(),
    } as unknown as ReturnType<typeof useAppStore>)
  })

  it('measures metadata loading time', async () => {
    const start = performance.now()
    vi.mocked(schemaService.getTables).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve([{ name: 'table1', type: 'table' }]), 100))
    )

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoadingSidebar).toBe(false))
    const duration = performance.now() - start
    
    console.log(`Metadata loading took ${duration.toFixed(2)}ms`)
    expect(duration).toBeGreaterThan(100)
    expect(result.current.filteredItems).toHaveLength(1)
  })

  it('does not refetch if schema is already cached', async () => {
    vi.mocked(schemaService.getTables).mockResolvedValue([{ name: 'table1', type: 'table' }])
    
    const wrapper = createWrapper()
    const { result, rerender } = renderHook(() => useExplorer(), { wrapper })

    await waitFor(() => expect(result.current.isLoadingSidebar).toBe(false))
    expect(schemaService.getTables).toHaveBeenCalledTimes(1)

    // Simulate same schema (no change)
    rerender()
    expect(schemaService.getTables).toHaveBeenCalledTimes(1)
  })

  it('resolves the connection of the active explorer tab', async () => {
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
      name: 'Mongo',
      type: DatabaseType.MONGODB,
      environment: Environment.LOCAL,
      host: 'localhost',
      port: 27017,
      user: '',
      database: 'myapp',
      createdAt: '',
      updatedAt: '',
    }
    vi.mocked(connectionService.getAll).mockResolvedValue([pgConn, mongoConn])
    vi.mocked(useAppStore).mockReturnValue({
      activeConnection: pgConn,
      explorer: {
        sidebarTab: SidebarTab.TABLES,
        search: '',
        activeExplorerTabId: 'mongo-id:myapp:students',
      },
      explorerTabs: {
        'mongo-id:myapp:students': {
          id: 'mongo-id:myapp:students',
          connectionId: 'mongo-id',
          database: 'myapp',
          selectedItem: { name: 'students', type: 'table' },
          activeTab: ExplorerTab.DATA,
          executionStatus: ExecutionStatus.IDLE,
          executionError: null,
          socketResults: null,
          page: 0,
          pageSize: 50,
          editableDdl: '',
          filter: '',
        },
      },
      setExplorerState: vi.fn(),
      updateExplorerTab: vi.fn(),
    } as unknown as ReturnType<typeof useAppStore>)

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('mongo-id')
    })
    expect(result.current.currentSchema).toBe('myapp')
  })

  it('keeps the active connection when the last explorer tab is closed', async () => {
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
    vi.mocked(connectionService.getAll).mockResolvedValue([pgConn])
    vi.mocked(schemaService.getTables).mockResolvedValue([
      { name: 'users', type: 'table' },
      { name: 'orders', type: 'table' },
    ])
    vi.mocked(useAppStore).mockReturnValue({
      activeConnection: pgConn,
      explorer: {
        sidebarTab: SidebarTab.TABLES,
        search: '',
        activeExplorerTabId: null,
      },
      explorerTabs: {},
      setExplorerState: vi.fn(),
      updateExplorerTab: vi.fn(),
    } as unknown as ReturnType<typeof useAppStore>)

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })
    expect(schemaService.getTables).toHaveBeenCalled()
    expect(result.current.activeConnection?.id).toBe('pg-id')
  })

  it('keeps the sidebar tables after the last tab is closed (transition)', async () => {
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
    vi.mocked(connectionService.getAll).mockResolvedValue([pgConn])
    vi.mocked(schemaService.getTables).mockResolvedValue([
      { name: 'users', type: 'table' },
      { name: 'orders', type: 'table' },
    ])

    const tabState = {
      id: 'pg-id:public:users',
      connectionId: 'pg-id',
      database: 'public',
      selectedItem: { name: 'users', type: 'table' },
      activeTab: ExplorerTab.DATA,
      executionStatus: ExecutionStatus.IDLE,
      executionError: null,
      socketResults: null,
      page: 0,
      pageSize: 50,
      editableDdl: '',
      filter: '',
    }

    // 1) tab open
    vi.mocked(useAppStore).mockReturnValue({
      activeConnection: pgConn,
      explorer: {
        sidebarTab: SidebarTab.TABLES,
        search: '',
        activeExplorerTabId: 'pg-id:public:users',
      },
      explorerTabs: { 'pg-id:public:users': tabState },
      setExplorerState: vi.fn(),
      updateExplorerTab: vi.fn(),
    } as unknown as ReturnType<typeof useAppStore>)

    const { result, rerender } = renderHook(() => useExplorer(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })

    // 2) last tab closed
    vi.mocked(useAppStore).mockReturnValue({
      activeConnection: pgConn,
      explorer: {
        sidebarTab: SidebarTab.TABLES,
        search: '',
        activeExplorerTabId: null,
      },
      explorerTabs: {},
      setExplorerState: vi.fn(),
      updateExplorerTab: vi.fn(),
    } as unknown as ReturnType<typeof useAppStore>)

    rerender()

    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('pg-id')
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })
  })

  it('keeps the sidebar tables after a reload (activeConnection null, persisted context)', async () => {
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
    vi.mocked(connectionService.getAll).mockResolvedValue([pgConn])
    vi.mocked(schemaService.getTables).mockResolvedValue([
      { name: 'users', type: 'table' },
      { name: 'orders', type: 'table' },
    ])
    vi.mocked(useAppStore).mockReturnValue({
      activeConnection: null,
      lastExplorerContext: { connectionId: 'pg-id', database: 'public' },
      explorer: {
        sidebarTab: SidebarTab.TABLES,
        search: '',
        activeExplorerTabId: null,
      },
      explorerTabs: {},
      setExplorerState: vi.fn(),
      updateExplorerTab: vi.fn(),
    } as unknown as ReturnType<typeof useAppStore>)

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.activeConnection?.id).toBe('pg-id')
      expect(result.current.currentSchema).toBe('public')
      expect(result.current.filteredItems.map((i) => i.name)).toEqual(['users', 'orders'])
    })
  })

  it('treats a persisted ghost connection as null after reload', async () => {
    vi.mocked(connectionService.getAll).mockResolvedValue([])
    vi.mocked(useAppStore).mockReturnValue({
      activeConnection: null,
      lastExplorerContext: { connectionId: 'deleted-id', database: 'public' },
      explorer: {
        sidebarTab: SidebarTab.TABLES,
        search: '',
        activeExplorerTabId: null,
      },
      explorerTabs: {},
      setExplorerState: vi.fn(),
      updateExplorerTab: vi.fn(),
    } as unknown as ReturnType<typeof useAppStore>)

    const { result } = renderHook(() => useExplorer(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.activeConnection).toBeNull()
    })
    expect(result.current.filteredItems).toEqual([])
  })
})
