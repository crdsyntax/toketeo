import { renderHook, waitFor, act } from '@testing-library/react'
import { useSchemas } from './useSchemas'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '@/store/useAppStore'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock the store
vi.mock('@/store/useAppStore', () => ({
  useAppStore: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useSchemas', () => {
  const mockSetActiveConnectionDatabase = vi.fn()
  const mockActiveConnection = { id: 'test-id', database: 'test-db' }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAppStore).mockReturnValue({
      activeConnection: mockActiveConnection,
      setActiveConnectionDatabase: mockSetActiveConnectionDatabase,
    } as ReturnType<typeof useAppStore>)
  })

  it('fetches schemas successfully', async () => {
    vi.mocked(invoke).mockResolvedValue(['schema1', 'schema2'])

    const { result } = renderHook(() => useSchemas(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.schemas).toEqual(['schema1', 'schema2'])
    expect(invoke).toHaveBeenCalledWith('get_schemas', { id: 'test-id' })
  })

  it('switches schema successfully', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'get_schemas') return Promise.resolve(['schema1'])
      if (cmd === 'switch_schema') return Promise.resolve(undefined)
      return Promise.resolve(null)
    })

    const { result } = renderHook(() => useSchemas(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.switchSchema('new-schema')
    })

    await waitFor(() => expect(mockSetActiveConnectionDatabase).toHaveBeenCalledWith('new-schema'))
    expect(invoke).toHaveBeenCalledWith('switch_schema', { id: 'test-id', schema: 'new-schema' })
  })
})
