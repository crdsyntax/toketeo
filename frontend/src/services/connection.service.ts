import { tauriApi } from '@/lib/api'
import type { Connection, CreateConnectionDto } from '@/types/database'

export const connectionService = {
  /**
   * Fetches all saved connections from the local Rust storage.
   */
  getAll: async (): Promise<Connection[]> => {
    const configs = await tauriApi.invoke<any[]>('get_connections')
    return configs.map(config => ({
        ...config,
        type: config.type,
        ssh: config.ssh
    })) as Connection[]
  },

  getOne: async (_id: string): Promise<Connection> => {
    const all = await connectionService.getAll()
    return all.find(c => c.id === _id) as Connection
  },

  /**
   * Persists a connection configuration to the local Rust database.
   */
  create: async (config: CreateConnectionDto): Promise<void> => {
    await tauriApi.invoke<string>('save_connection', { config })
  },

  /**
   * Updates an existing connection configuration.
   */
  update: async (id: string, config: Partial<CreateConnectionDto>): Promise<void> => {
    await tauriApi.invoke<void>('save_connection', { config: { id, ...config } })
  },

  /**
   * Deletes a connection configuration from the local Rust database.
   */
  delete: async (id: string): Promise<void> => {
    await tauriApi.invoke<void>('delete_connection', { id })
  },

  /**
   * Establishes an active session in the Rust backend.
   */
  connect: async (config: CreateConnectionDto): Promise<string> => {
    return await tauriApi.invoke<string>('connect', { config })
  },

  disconnect: async (id: string): Promise<void> => {
    await tauriApi.invoke<void>('disconnect', { id })
  },

  test: async (config: CreateConnectionDto): Promise<string> => {
    return await tauriApi.invoke<string>('connect', { config })
  }
}
