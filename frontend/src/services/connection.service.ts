import { apiClient } from '@/lib/api'
import type { Connection, CreateConnectionDto } from '@/types/database'

export const connectionService = {
  getAll: async () => {
    const response = await apiClient.get<Connection[]>('/connections')
    return response.data
  },

  getOne: async (id: string) => {
    const response = await apiClient.get<Connection>(`/connections/${id}`)
    return response.data
  },

  create: async (data: CreateConnectionDto) => {
    const response = await apiClient.post<Connection>('/connections', data)
    return response.data
  },

  update: async (id: string, data: Partial<CreateConnectionDto>) => {
    const response = await apiClient.patch<Connection>(`/connections/${id}`, data)
    return response.data
  },

  delete: async (id: string) => {
    await apiClient.delete(`/connections/${id}`)
  },

  test: async (data: CreateConnectionDto) => {
    const response = await apiClient.post('/connections/test', data)
    return response.data
  }
}
