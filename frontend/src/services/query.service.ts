import { apiClient } from '@/lib/api'
import type { QueryResult } from '@/types/database'

export const queryService = {
  execute: async (connectionId: string, sql: string, schema?: string, params?: unknown[], page?: number, pageSize?: number) => {
    const response = await apiClient.post<QueryResult>(`/connections/${connectionId}/query/execute`, {
      sql,
      schema,
      params,
      page,
      pageSize
    })
    return response.data
  },

  cancel: async (connectionId: string) => {
    // Note: Cancel endpoint might need verification on backend path if it exists
    await apiClient.post(`/connections/${connectionId}/query/cancel`)
  }
}
