import { tauriApi } from '@/lib/api'
import type { QueryResult } from '@/types/database'

export const queryService = {
  /**
   * Executes a query using the native Rust backend via Tauri IPC.
   */
  execute: async (id: string, query: string, _schema?: string, _params?: unknown[], _page?: number, _pageSize?: number) => {
    return await tauriApi.invoke<QueryResult>('execute_query', {
      id,
      query
    })
  },

  cancel: async (_id: string) => {
    console.warn('Query cancellation not yet implemented in Rust')
  }
}
