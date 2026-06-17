import { tauriApi } from '@/lib/api'
import type { Connection, CreateConnectionDto } from '@/types/database'

export const connectionService = {
  /**
   * Fetches all saved connections from the local Rust storage.
   */
  getAll: async (): Promise<Connection[]> => {
    return await tauriApi.invoke<Connection[]>('get_connections')
  },

  getOne: async (id: string): Promise<Connection> => {
    return await tauriApi.invoke<Connection>('get_connection', { id })
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

  commit: async (id: string): Promise<void> => {
    await tauriApi.invoke<void>('commit_transaction', { id })
  },

  rollback: async (id: string): Promise<void> => {
    await tauriApi.invoke<void>('rollback_transaction', { id })
  },

  exportConnection: async (id: string, name: string): Promise<string | null> => {
    return await tauriApi.invoke<string | null>('export_connection_dialog', { id, defaultFileName: `${name}.json` })
  },

  exportAll: async (): Promise<string | null> => {
    return await tauriApi.invoke<string | null>('export_all_connections_dialog', { defaultFileName: 'toketeo-connections.json' })
  },

  importConnections: async (): Promise<string[]> => {
    return await tauriApi.invoke<string[]>('import_connections_dialog')
  },

  test: async (config: CreateConnectionDto): Promise<string> => {
    return await tauriApi.invoke<string>('connect', { config })
  }
}
