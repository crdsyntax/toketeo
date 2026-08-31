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
