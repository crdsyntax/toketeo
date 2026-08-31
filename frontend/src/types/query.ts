export interface ScriptStatementResult {
  index: number
  sql: string
  ok: boolean
  skipped?: boolean
  rowsAffected: number | null
  rowCount: number | null
  error: string | null
}

export interface ScriptReport {
  runId: string
  total: number
  ok: number
  failed: number
  skipped: number
  rolledBack: boolean
  pendingCommit: boolean
  results: ScriptStatementResult[]
}

export type ScriptLivePhase = 'pending' | 'running' | 'ok' | 'failed' | 'skipped'

export interface ScriptLiveStatement {
  index: number
  sql: string
  phase: ScriptLivePhase
  error?: string | null
  rowsAffected?: number | null
  rowCount?: number | null
}

export type ScriptDecision = 'skip' | 'skip_all' | 'cancel'

export interface ScriptErrorPrompt {
  runId: string
  index: number
  sql: string
  error: string
}
