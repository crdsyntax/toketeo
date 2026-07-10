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

  disconnectAll: async (): Promise<void> => {
    await tauriApi.invoke<void>('disconnect_all', {})
  },

  commit: async (id: string): Promise<number> => {
    return await tauriApi.invoke<number>('commit_transaction', { id })
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

  reconnect: async (id: string): Promise<string> => {
    return await tauriApi.invoke<string>('reconnect_connection', { id })
  },

  test: async (config: CreateConnectionDto): Promise<string> => {
    return await tauriApi.invoke<string>('connect', { config })
  },

  // Auth commands
  checkMasterPasswordExists: async (): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('check_master_password_exists')
  },

  createMasterPassword: async (password: string): Promise<void> => {
    await tauriApi.invoke<void>('create_master_password', { password })
  },

  unlockSession: async (password: string): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('unlock_session', { password })
  },

  lockSession: async (): Promise<void> => {
    await tauriApi.invoke<void>('lock_session')
  },

  changeMasterPassword: async (oldPassword: string, newPassword: string): Promise<void> => {
    await tauriApi.invoke<void>('change_master_password', { oldPassword, newPassword })
  },

  isSessionUnlocked: async (): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('is_session_unlocked')
  },

  // Windows Hello / Keyring
  isWindowsHelloAvailable: async (): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('is_windows_hello_available')
  },

  storeMasterInKeyring: async (password: string): Promise<void> => {
    await tauriApi.invoke<void>('store_master_in_keyring', { password })
  },

  getMasterFromKeyring: async (): Promise<string | null> => {
    return await tauriApi.invoke<string | null>('get_master_from_keyring')
  },

  removeMasterFromKeyring: async (): Promise<void> => {
    await tauriApi.invoke<void>('remove_master_from_keyring')
  },

  unlockWithWindowsHello: async (): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('unlock_with_windows_hello')
  },

  // TOTP Authenticator
  isTotpAvailable: async (): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('is_totp_available')
  },

  generateTotpSetup: async (): Promise<{ secret: string; uri: string; qr_code_svg: string }> => {
    return await tauriApi.invoke<{ secret: string; uri: string; qr_code_svg: string }>('generate_totp_setup')
  },

  verifyAndEnableTotp: async (secret: string, code: string): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('verify_and_enable_totp', { secret, code })
  },

  isTotpEnabled: async (): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('is_totp_enabled')
  },

  unlockWithTotp: async (code: string): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('unlock_with_totp', { code })
  },

  disableTotp: async (): Promise<void> => {
    await tauriApi.invoke<void>('disable_totp')
  }
}
