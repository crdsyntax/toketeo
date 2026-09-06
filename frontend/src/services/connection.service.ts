import { tauriApi } from '@/lib/api'
import type { Connection, CreateConnectionDto } from '@/types/database'

const CONNECT_TIMEOUT_MS = 30_000

function withConnectTimeout<T>(promise: Promise<T>, action: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${action} timed out after ${CONNECT_TIMEOUT_MS / 1000}s. Check your internet connection or server availability.`,
        ),
      )
    }, CONNECT_TIMEOUT_MS)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export const connectionService = {


  getAll: async (): Promise<Connection[]> => {
    return await tauriApi.invoke<Connection[]>('get_connections')
  },

  getOne: async (id: string): Promise<Connection> => {
    return await tauriApi.invoke<Connection>('get_connection', { id })
  },



  revealSecret: async (id: string, field: string): Promise<string | null> => {
    return await tauriApi.invoke<string | null>('reveal_connection_secret', { id, field })
  },



  create: async (config: CreateConnectionDto): Promise<void> => {
    await tauriApi.invoke<string>('save_connection', { config })
  },



  update: async (id: string, config: Partial<CreateConnectionDto>): Promise<void> => {
    await tauriApi.invoke<void>('save_connection', { config: { id, ...config } })
  },



  delete: async (id: string): Promise<void> => {
    await tauriApi.invoke<void>('delete_connection', { id })
  },



  connect: async (config: CreateConnectionDto): Promise<string> => {
    return await withConnectTimeout(
      tauriApi.invoke<string>('connect', { config }),
      'Connection',
    )
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
    return await withConnectTimeout(
      tauriApi.invoke<string>('reconnect_connection', { id }),
      'Reconnection',
    )
  },

  test: async (config: CreateConnectionDto): Promise<string> => {
    return await withConnectTimeout(
      tauriApi.invoke<string>('connect', { config }),
      'Connection test',
    )
  },


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

  lockSecrets: async (): Promise<void> => {
    await tauriApi.invoke<void>('lock_secrets')
  },

  isSecretsBlocked: async (): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('is_secrets_blocked')
  },

  isSecretsUnlocked: async (): Promise<boolean> => {
    const session = await tauriApi.invoke<boolean>('is_session_unlocked')
    if (!session) return false
    return !(await tauriApi.invoke<boolean>('is_secrets_blocked'))
  },

  changeMasterPassword: async (oldPassword: string, newPassword: string): Promise<void> => {
    await tauriApi.invoke<void>('change_master_password', { oldPassword, newPassword })
  },

  isSessionUnlocked: async (): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('is_session_unlocked')
  },

  generateRecoveryCode: async (): Promise<string> => {
    return await tauriApi.invoke<string>('generate_recovery_code')
  },

  isRecoveryCodeSet: async (): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('is_recovery_code_set')
  },

  recoverMasterPassword: async (recoveryCode: string, newPassword: string): Promise<void> => {
    await tauriApi.invoke<void>('recover_master_password', { recoveryCode, newPassword })
  },


  isWindowsHelloAvailable: async (): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('is_windows_hello_available')
  },

  storeMasterInKeyring: async (password: string): Promise<void> => {
    await tauriApi.invoke<void>('store_master_in_keyring', { password })
  },

  isMasterInKeyring: async (): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('is_master_in_keyring')
  },

  removeMasterFromKeyring: async (): Promise<void> => {
    await tauriApi.invoke<void>('remove_master_from_keyring')
  },

  unlockWithWindowsHello: async (): Promise<boolean> => {
    return await tauriApi.invoke<boolean>('unlock_with_windows_hello')
  },


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
