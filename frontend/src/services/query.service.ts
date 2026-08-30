import { tauriApi } from '@/lib/api'
import type { QueryResult } from '@/types/database'

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

/** Statement del script tal como se ve en el panel de resultados en vivo. */
export interface ScriptLiveStatement {
  index: number
  sql: string
  phase: ScriptLivePhase
  error?: string | null
  rowsAffected?: number | null
  rowCount?: number | null
}

export type ScriptDecision = 'skip' | 'skip_all' | 'cancel'

export const queryService = {
  /**
   * Executes a query using the native Rust backend via Tauri IPC.
   */
  execute: async (id: string, query: string, schema?: string, params?: unknown[], page?: number, pageSize?: number) => {
    const args: Record<string, unknown> = { id, query };
    if (schema && typeof schema === 'string' && schema.trim().length > 0) args.schema = schema.trim();
    if (params) args.params = params;
    if (page !== undefined) args.page = page;
    if (pageSize !== undefined) args.pageSize = pageSize;
    return await tauriApi.invoke<QueryResult>('execute_query', args)
  },

  /**
   * Ejecuta un script multi-statement en una transacción. El backend pausa
   * ante cada statement fallido y emite `script:error-prompt`; el frontend
   * responde con `respond()` (skip / skip_all / cancel).
   */
  runScript: async (id: string, statements: string[], schema?: string) => {
    const args: Record<string, unknown> = { id, statements };
    if (schema && typeof schema === 'string' && schema.trim().length > 0) args.schema = schema.trim();
    return await tauriApi.invoke<ScriptReport>('run_script', args)
  },

  /** Responde a un prompt de error del script en curso. */
  /** Responde a un prompt de error del script en curso. */
  respond: async (runId: string, decision: ScriptDecision) => {
    return await tauriApi.invoke('script_respond', { runId, decision })
  },

  /** Cancela el script en curso (rollback). */
  cancelScript: async (runId: string) => {
    return await tauriApi.invoke('cancel_script', { runId })
  },

  cancel: async (id: string) => {
    console.warn(`Query cancellation not yet implemented in Rust for connection ${id}`)
  }
}