import { invoke } from '@tauri-apps/api/core'

/**
 * Tauri API client to replace Axios and connect directly to Rust commands.
 */
export const tauriApi = {
  /**
   * Invokes a Rust command via Tauri IPC.
   * This handles error transformation to match the previous frontend expectations.
   */
  invoke: async <T>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
    try {
      console.log(`[Tauri] Invoking command: ${command}`, args)
      const response = await invoke<T>(command, args)
      return response
    } catch (error: unknown) {
      console.error(`[Tauri Error] Command ${command} failed:`, error)
      // Standardizing error format
      const message = typeof error === 'string' 
        ? error 
        : (error instanceof Error ? error.message : 'Internal Rust Error')
      throw new Error(message, { cause: error })
    }
  }
}

/**
 * Compatibility layer for older Axios-style calls.
 */
export const apiClient = {
  get: async <T>(url: string) => ({ data: await tauriApi.invoke<T>('get_' + url.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '_')) }),
  post: async <T>(url: string, data?: unknown) => ({ data: await tauriApi.invoke<T>(url.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '_') || 'post', data as Record<string, unknown>) }),
  patch: async <T>(url: string, data?: unknown) => ({ data: await tauriApi.invoke<T>('update_' + url.split('/')[1], { id: url.split('/')[2], ...(data as Record<string, unknown>) }) }),
  delete: async (url: string) => { await tauriApi.invoke('delete_' + url.split('/')[1], { id: url.split('/')[2] }) },
}

/**
 * Mock for getApiUrl to satisfy TS errors in unused parts.
 */
export function getApiUrl(path: string): string {
  return `tauri://api${path}`
}
