import { renderHook, waitFor } from '@testing-library/react'
import { useExplorer } from './useExplorer'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { schemaService } from '@/services/schema.service'
import { useAppStore } from '@/store/useAppStore'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ExecutionStatus, SidebarTab, ExplorerTab } from '@/types/database'

// Mock the store and service
vi.mock('@/store/useAppStore')
vi.mock('@/services/schema.service')

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 1000,
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
    vi.mocked(useAppStore).mockReturnValue({
      activeConnection: mockActiveConnection,
      explorer: {
        selectedItem: null,
        sidebarTab: SidebarTab.TABLES,
        activeTab: ExplorerTab.COLUMNS,
        search: '',
        executionStatus: ExecutionStatus.IDLE,
        executionError: null,
        socketResults: null
      },
      setExplorerState: vi.fn(),
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
})
