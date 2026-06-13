import { tauriApi } from '@/lib/api'
import type { Connection, CreateConnectionDto } from '@/types/database'

export const connectionService = {
  getAll: async (): Promise<Connection[]> => {
    return [] 
  },

  getOne: async (_id: string): Promise<Connection> => {
    return {} as Connection
  },

  create: async (config: CreateConnectionDto) => {
    await tauriApi.invoke<string>('connect', { config })
  },

  update: async (id: string, config: Partial<CreateConnectionDto>) => {
    await tauriApi.invoke<void>('connect', { config: { id, ...config } })
  },

  delete: async (id: string) => {
    await tauriApi.invoke<void>('disconnect', { id })
  },

  connect: async (config: CreateConnectionDto) => {
    return await tauriApi.invoke<string>('connect', { config })
  },

  disconnect: async (id: string) => {
    return await tauriApi.invoke<void>('disconnect', { id })
  },

  test: async (config: CreateConnectionDto) => {
    return await tauriApi.invoke<string>('connect', { config })
  }
}
