export type ExecutionStatus = 'idle' | 'executing' | 'success' | 'error';

export interface DatabaseObject {
  name: string;
  type: 'table' | 'view' | 'procedure' | 'trigger';
}

export enum DatabaseType {
  MARIADB = 'mariadb',
  POSTGRES = 'postgres',
  MONGODB = 'mongodb',
}

export enum Environment {
  PRODUCTION = 'production',
  STAGING = 'staging',
  DEVELOPMENT = 'development',
  LOCAL = 'local',
}

export interface SshConfig {
  host: string
  port: number
  user: string
  password?: string
  privateKey?: string
  passphrase?: string
  keyPath?: string
}

export type DbValue = string | number | boolean | null | undefined;
export type DbRow = Record<string, DbValue>;

export interface QueryResult {
  columns: string[];
  rows: DbRow[];
  executionTime: number;
  affectedRows?: number;
  message?: string;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
}

export interface TableColumn {
  name: string;
  type: string;
  isNullable: boolean;
  isPrimaryKey?: boolean;
}

export interface ColumnResponse {
  name: string;
  type: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string;
  comment?: string;
}

export interface TableResponse {
  name: string;
  schema?: string;
  type: string;
  engine?: string;
  rows?: number;
  dataLength?: number;
  indexLength?: number;
  comment?: string;
  createTime?: string;
}

export interface IndexResponse {
  name: string;
  column: string;
  isUnique: boolean;
  type?: string;
  targetColumn?: string;
  // Metadata fallbacks
  INDEX_NAME?: string;
  index_name?: string;
  COLUMN_NAME?: string;
  column_name?: string;
  NON_UNIQUE?: number;
  non_unique?: number;
  INDEX_TYPE?: string;
  index_type?: string;
}

export interface ForeignKeyResponse {
  constraintName: string;
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
  // Metadata fallbacks
  CONSTRAINT_NAME?: string;
  constraint_name?: string;
  COLUMN_NAME?: string;
  column_name?: string;
  REFERENCED_TABLE_NAME?: string;
  referenced_table_name?: string;
  REFERENCED_COLUMN_NAME?: string;
  referenced_column_name?: string;
}

export interface ConstraintResponse {
  name: string;
  type: string;
  // Metadata fallbacks
  CONSTRAINT_NAME?: string;
  constraint_name?: string;
  CONSTRAINT_TYPE?: string;
  constraint_type?: string;
}

export interface ParameterResponse {
  name: string;
  type: string;
  mode: 'IN' | 'OUT' | 'INOUT';
}

export interface Connection {
  id: string
  name: string
  type: DatabaseType
  environment: Environment
  host: string
  port: number
  user: string
  password?: string
  database?: string
  authSource?: string
  replicaSet?: string
  ssl?: string
  ssh?: SshConfig
  createdAt: string
  updatedAt: string
}

export type CreateConnectionDto = Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>
