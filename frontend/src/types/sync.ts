export enum SyncMode {
  Full = 'full',
  Incremental = 'incremental',
}

export enum PipelineStatus {
  Draft = 'draft',
  Ready = 'ready',
  Running = 'running',
  Paused = 'paused',
  Retrying = 'retrying',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Failed = 'failed',
}

export enum UpsertStrategy {
  OnConflict = 'on_conflict',
  OnDuplicateKey = 'on_duplicate_key',
  Merge = 'merge',
  UpsertDoc = 'upsert_doc',
}

export interface DriverCapabilities {
  supports_transactions: boolean;
  supports_savepoints: boolean;
  supports_upsert: boolean;
  upsert_strategy: UpsertStrategy | null;
  supports_keyset_pagination: boolean;
  supports_streaming: boolean;
  supports_json: boolean;
  supports_arrays: boolean;
  supports_returning: boolean;
  max_batch_size: number;
}

export interface SyncPipeline {
  id: string;
  name: string;
  source_connection_id: string;
  target_connection_id: string;
  mode: SyncMode;
  status: PipelineStatus;
  tables: SyncTableConfig[];
  batch_size: number;
  created_at: string;
  updated_at: string;
}

export interface SyncTableConfig {
  source_table: string;
  target_table: string;
  column_mappings: ColumnMapping[];
  filters?: string;
  primary_key?: string[];
}

export interface ColumnMapping {
  source_column: string;
  destination_column: string;
  transform?: ColumnTransform;
}

export interface ColumnTransform {
  type: 'trim' | 'uppercase' | 'lowercase' | 'default_value' | 'regex' | 'concat' | 'cast' | 'date_format';
  value?: string;
  replacement?: string;
  parts?: string[];
  target_type?: string;
  format?: string;
  pattern?: string;
}

export interface SyncRun {
  id: string;
  pipeline_id: string;
  status: PipelineStatus;
  started_at?: string;
  completed_at?: string;
  total_rows: number;
  processed_rows: number;
  error_count: number;
  batch_count: number;
}

export interface SyncCheckpoint {
  id: string;
  pipeline_id: string;
  run_id: string;
  table_name: string;
  last_processed_key?: string;
  batch_number: number;
}

export interface SyncBatch {
  id: string;
  run_id: string;
  batch_number: number;
  table_name: string;
  rows_extracted: number;
  rows_loaded: number;
  duration_ms: number;
  status: string;
  error_message?: string;
}

export interface SyncRowError {
  id: string;
  batch_id: string;
  row_key?: string;
  column_name?: string;
  error_message: string;
  raw_value?: string;
}

export interface ValidationReport {
  is_valid: boolean;
  source_connection_ok: boolean;
  target_connection_ok: boolean;
  table_checks: TableValidation[];
  warnings: string[];
  errors: string[];
}

export interface TableValidation {
  table_name: string;
  exists_on_source: boolean;
  exists_on_target: boolean;
  columns_match: boolean;
  column_diffs: ColumnDiff[];
  primary_key_match: boolean;
  issues: string[];
}

export interface ColumnDiff {
  column_name: string;
  source_type?: string;
  target_type?: string;
  source_nullable?: boolean;
  target_nullable?: boolean;
  diff_type: DiffType;
}

export enum DiffType {
  MissingInSource = 'missing_in_source',
  MissingInTarget = 'missing_in_target',
  TypeMismatch = 'type_mismatch',
  NullableMismatch = 'nullable_mismatch',
}

export interface SyncEvent {
  TableStarted?: { table: string; table_index: number; total_tables: number };
  BatchCompleted?: { table: string; batch_number: number; rows_loaded: number; duration_ms: number };
  RowError?: { table: string; row_key?: string; error: string };
  PhaseCompleted?: { table: string; total_rows: number };
  Progress?: { table: string; processed_rows: number; total_rows: number; error_count: number };
  Error?: { message: string };
  Completed?: Record<string, never>;
}

export type CreateSyncPipelineDto = Omit<SyncPipeline, 'id' | 'created_at' | 'updated_at' | 'status'>;
