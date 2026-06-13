import { invoke } from '@tauri-apps/api/core'

/**
 * Tauri API client to replace Axios and connect directly to Rust commands.
 */
export const tauriApi = {
  /**
   * Invokes a Rust command via Tauri IPC.
   * This handles error transformation to match the previous frontend expectations.
   */
  invoke: async <T>(command: string, args: Record<string, any> = {}): Promise<T> => {
    try {
      console.log(`[Tauri] Invoking command: ${command}`, args)
      const response = await invoke<T>(command, args)
      return response
    } catch (error: any) {
      console.error(`[Tauri Error] Command ${command} failed:`, error)
      // Standardizing error format
      const message = typeof error === 'string' ? error : (error.message || 'Internal Rust Error')
      throw new Error(message)
    }
  }
}

/**
 * Compatibility layer for older Axios-style calls.
 */
export const apiClient = {
  get: async <T>(url: string, _config?: any) => ({ data: await tauriApi.invoke<T>('get_' + url.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '_')) }),
  post: async <T>(url: string, data?: any, _config?: any) => ({ data: await tauriApi.invoke<T>(url.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '_') || 'post', data) }),
  patch: async <T>(url: string, data?: any, _config?: any) => ({ data: await tauriApi.invoke<T>('update_' + url.split('/')[1], { id: url.split('/')[2], ...data }) }),
  delete: async (url: string, _config?: any) => { await tauriApi.invoke('delete_' + url.split('/')[1], { id: url.split('/')[2] }) },
}

/**
 * Mock for getApiUrl to satisfy TS errors in unused parts.
 */
export function getApiUrl(path: string): string {
  return `tauri://api${path}`
}
