import { tauriApi } from '@/lib/api'
import type { AuditEntry } from '@/types/audit'

export const auditService = {


  getLogs: async (limit = 50, offset = 0) => {
    return await tauriApi.invoke<AuditEntry[]>('get_audit_logs', {
      limit,
      offset
    })
  }
}
