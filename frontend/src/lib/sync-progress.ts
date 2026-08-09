import type { SyncRun } from '@/types/sync'
import { PipelineStatus } from '@/types/sync'

export interface ProgressState {
  completedBatches: number
  processedRows: number
  totalRows: number
  errors: number
  skipped: number
  currentTable: string
  tableIndex: number
  totalTables: number
  phase: 'extracting' | 'loading' | 'done' | 'idle'
  elapsedMs: number
  estimatedMs: number
}

export interface MiniLog {
  type: 'batch' | 'error' | 'phase'
  table: string
  message: string
  time: Date
}

export const createInitialProgress = (run: SyncRun): ProgressState => ({
  completedBatches: 0,
  processedRows: run.processed_rows,
  totalRows: run.total_rows,
  errors: run.error_count,
  skipped: 0,
  currentTable: '',
  tableIndex: 0,
  totalTables: 0,
  phase: run.status === PipelineStatus.Completed ? 'done' : 'idle',
  elapsedMs: 0,
  estimatedMs: 0,
})
