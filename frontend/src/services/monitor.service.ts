import { tauriApi } from '@/lib/api'

export interface ProcessEntry {
  ID: string | number
  USER?: string | null
  HOST?: string | null
  DB?: string | null
  COMMAND?: string | null
  TIME?: string | number | null
  STATE?: string | null
  INFO?: string | null
}

export interface InnodbIndicator {
  id: string
  label: string
  value: string
  hint: string
  level: 'ok' | 'warning' | 'critical'
}

export interface InnodbSummary {
  health: 'ok' | 'warning' | 'critical'
  healthMessage: string
  indicators: InnodbIndicator[]
}

export interface InnoDbSection {
  name: string
  content: string
}

export interface InnoDbStatus {
  type: string
  status: string
  transactionsSection: string | null
  sections: InnoDbSection[]
  summary: InnodbSummary
}

export const monitorService = {

  processList: async (id: string): Promise<ProcessEntry[]> => {
    return await tauriApi.invoke<ProcessEntry[]>('monitor_process_list', { id })
  },


  slowQueries: async (id: string, minTime: number): Promise<ProcessEntry[]> => {
    return await tauriApi.invoke<ProcessEntry[]>('monitor_slow_queries', { id, minTime })
  },


  innodbStatus: async (id: string): Promise<InnoDbStatus> => {
    return await tauriApi.invoke<InnoDbStatus>('monitor_innodb_status', { id })
  },


  killProcess: async (id: string, processId: string): Promise<string> => {
    return await tauriApi.invoke<string>('monitor_kill_process', { id, processId })
  },
}
