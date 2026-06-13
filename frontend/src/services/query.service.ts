import { tauriApi } from '@/lib/api'
import type { QueryResult } from '@/types/database'

export const queryService = {
  /**
   * Executes a query using the native Rust backend via Tauri IPC.
   */
  execute: async (id: string, query: string, schema?: string, params?: unknown[], page?: number, pageSize?: number) => {
    return await tauriApi.invoke<QueryResult>('execute_query', {
      id,
      query,
      schema,
      params,
      page,
      pageSize
    })
  },

  cancel: async (id: string) => {
    console.warn(`Query cancellation not yet implemented in Rust for connection ${id}`)
  }
}
