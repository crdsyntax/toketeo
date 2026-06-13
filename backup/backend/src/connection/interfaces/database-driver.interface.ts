export interface ColumnMetadata {
  name: string;
  type: string;
  isNullable: boolean;
  defaultValue?: string;
  maxLength?: number;
}

export interface IndexMetadata {
  name: string;
  column: string;
  isUnique: boolean;
  type?: string;
  targetColumn?: string;
}

export interface ForeignKeyMetadata {
  constraintName: string;
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface ConstraintMetadata {
  name: string;
  type: string;
  definition?: string;
}

export interface ParameterMetadata {
  name: string;
  type: string;
  mode: 'IN' | 'OUT' | 'INOUT';
}

export interface QueryResultInfo {
  rows?: Record<string, unknown>[];
  affectedRows?: number;
  insertId?: number | string;
  fields?: unknown[];
}

export interface DatabaseDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  executeQuery<T>(sql: string, params?: unknown[]): Promise<T>;
  executeQueryStream?(
    sql: string,
    params?: unknown[],
  ): AsyncIterableIterator<Record<string, unknown>>;
  getTables(): Promise<string[]>;
  getSchemas?(): Promise<string[]>;
  setSchema?(schema: string): void;
  getColumns(table: string): Promise<ColumnMetadata[]>;
  getIndexes?(table: string): Promise<IndexMetadata[]>;
  getForeignKeys?(table: string): Promise<ForeignKeyMetadata[]>;
  getConstraints?(table: string): Promise<ConstraintMetadata[]>;
  getDDL(
    name: string,
    type?: 'table' | 'view' | 'procedure' | 'trigger',
  ): Promise<string>;
  getParameters?(
    name: string,
    type: 'procedure' | 'function' | 'view',
  ): Promise<ParameterMetadata[]>;
  getViews?(): Promise<string[]>;
  getProcedures?(): Promise<string[]>;
  getTriggers?(): Promise<string[]>;
  cancelQuery?(): Promise<void>;
}
