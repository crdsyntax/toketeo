import { tauriApi } from '@/lib/api'
import type { AuditEntry } from '@/types/audit'

export const auditService = {
  /**
   * Fetches audit logs from the native Rust backend via Tauri IPC.
   */
  getLogs: async (limit = 50, offset = 0) => {
    return await tauriApi.invoke<AuditEntry[]>('get_audit_logs', {
      limit,
      offset
    })
  }
}
