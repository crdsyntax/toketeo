export type CompareStatus = 'equal' | 'modified' | 'missing' | 'new';

export interface ObjectDiff {
  name: string;
  status: CompareStatus;
  details?: Record<string, unknown>;
}

export interface ColumnDiffDetail {
  name: string;
  status: CompareStatus;
  source_type?: string;
  target_type?: string;
  source_nullable?: boolean;
  target_nullable?: boolean;
  source_default?: string;
  target_default?: string;
}

export interface TableDiff {
  status: CompareStatus;
  columns: ColumnDiffDetail[];
  engine_changed?: [string, string];
  charset_changed?: [string, string];
  collation_changed?: [string, string];
  comment_changed?: [string, string];
}

export interface IndexDiff {
  name: string;
  table: string;
  status: CompareStatus;
  columns_changed?: [string[], string[]];
  unique_changed?: [boolean, boolean];
  type_changed?: [string, string];
}

export interface FkDiff {
  name: string;
  table: string;
  status: CompareStatus;
  referenced_table?: [string, string];
  on_delete?: [string, string];
  on_update?: [string, string];
  columns?: [string[], string[]];
}

export interface ConstraintDiff {
  name: string;
  table: string;
  status: CompareStatus;
  constraint_type?: string;
  definition_changed?: [string, string];
}

export interface SchemaReport {
  source_name: string;
  target_name: string;
  compared_at: string;
  tables: ObjectDiff[];
  views: ObjectDiff[];
  procedures: ObjectDiff[];
  functions: ObjectDiff[];
  triggers: ObjectDiff[];
  indexes: IndexDiff[];
  foreign_keys: FkDiff[];
  constraints: ConstraintDiff[];
  warnings: string[];
  errors: string[];
  summary?: string;
}

export interface RowColumnDiff {
  pk_value: string;
  column: string;
  source_value?: unknown;
  target_value?: unknown;
}

export interface TableDataDiff {
  table: string;
  status: CompareStatus;
  source_count: number;
  target_count: number;
  rows_equal: number;
  rows_modified: number;
  rows_only_in_source: number;
  rows_only_in_target: number;
  pk_columns: string[];
  column_diffs: RowColumnDiff[];
  source_only_rows: RowColumnDiff[];
  target_only_rows: RowColumnDiff[];
}

export interface DataReport {
  tables: TableDataDiff[];
}

export interface ScriptStatement {
  id: string;
  sql: string;
  description: string;
  diff_type: string;
  object_name: string;
  object_type: string;
  selected: boolean;
  preserve_data: boolean;
  backup_sql?: string;
}

export interface SyncScript {
  statements: ScriptStatement[];
  target_db_type: string;
}

export interface ScriptOptions {
  include_creates: boolean;
  include_alters: boolean;
  include_drops: boolean;
  include_indexes: boolean;
  include_constraints: boolean;
  include_views: boolean;
  include_routines: boolean;
  wrap_in_transaction: boolean;
  data_preservation: boolean;
  drop_target_extras: boolean;
}

export interface CompareSection {
  key: string;
  label: string;
  icon?: string;
  diffs: (ObjectDiff | IndexDiff | FkDiff | ConstraintDiff)[];
  getStatus: (item: unknown) => CompareStatus;
  getName: (item: unknown) => string;
}

export interface CompareSession {
  id: string;
  source_conn_id: string;
  target_conn_id: string;
  source_database?: string;
  target_database?: string;
  source_schema?: string;
  target_schema?: string;
  selected_tables?: string[];
  schema_report?: SchemaReport;
  data_report?: DataReport;
  sync_script?: SyncScript;
  script_options?: ScriptOptions;
  active_tab?: string;
  created_at: string;
  updated_at: string;
}
