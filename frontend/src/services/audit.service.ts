import { apiClient } from '@/lib/api'
import type { AuditEntry } from '@/types/audit'

export const auditService = {
  getLogs: async (limit = 50, offset = 0) => {
    const response = await apiClient.get<AuditEntry[]>('/audit', {
      params: { limit, offset }
    })
    return response.data
  }
}
