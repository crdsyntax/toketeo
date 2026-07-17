export enum ExecutionStatus {
  IDLE = 'idle',
  EXECUTING = 'executing',
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum DatabaseObjectType {
  TABLE = 'table',
  VIEW = 'view',
  PROCEDURE = 'procedure',
  TRIGGER = 'trigger',
  FUNCTION = 'function',
}

export interface DatabaseObject {
  name: string;
  type: DatabaseObjectType;
}

export enum ExplorerTab {
  COLUMNS = 'columns',
  DATA = 'data',
  DDL = 'ddl',
  INDEXES = 'indexes',
  FOREIGN_KEYS = 'foreign-keys',
  CONSTRAINTS = 'constraints',
}

export enum SidebarTab {
  TABLES = 'tables',
  VIEWS = 'views',
  PROCEDURES = 'procedures',
  TRIGGERS = 'triggers',
  FUNCTIONS = 'functions',
}

export enum DatabaseType {
  MARIADB = 'mariadb',
  MYSQL = 'mysql',
  POSTGRES = 'postgres',
  MONGODB = 'mongodb',
  SQLSERVER = 'sqlserver',
  SQLITE = 'sqlite',
  REDIS = 'redis',
}

export enum Environment {
  PRODUCTION = 'production',
  STAGING = 'staging',
  DEVELOPMENT = 'development',
  LOCAL = 'local',
}

export enum SshAuthType {
  PASSWORD = 'password',
  KEY = 'key',
}

export interface SshConfig {
  host: string
  port: number
  user: string
  authType: SshAuthType
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
  primary_keys?: string[];
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
  authEnabled?: boolean
  authSource?: string
  replicaSet?: string
  directConnection?: boolean
  ssl?: string
  ssh?: SshConfig
  readOnly?: boolean
  maxPoolSize?: number
  idleTimeout?: number
  acquireTimeout?: number
  maxLifetime?: number
  keepAlive?: number
  metadataCacheTtl?: number
  createdAt: string
  updatedAt: string
}

export type CreateConnectionDto = Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>

export interface DumpSelection {
  tables: string[]
  views: string[]
  triggers: string[]
  procedures: string[]
  functions: string[]
}

export interface IntegrityResult {
  fileSizeBytes: number
  fileSizeKB: number
  createStatements: number
  insertStatements: number
  totalStatements: number
  expectedTables: number
  passed: boolean
}

export interface DumpObjects {
  tables: string[]
  views: string[]
  triggers: string[]
  procedures: string[]
  functions: string[]
}

export type EdgeCardinality = '1:1' | '1:N' | 'N:M'

export interface DiagramTable {
  name: string
  columns: ColumnResponse[]
  foreign_keys: ForeignKeyResponse[]
}

export interface SchemaDiagramData {
  tables: DiagramTable[]
}

export enum JobType {
  Backup = 'backup',
  Report = 'report',
  CsvExport = 'csv_export',
}

export interface ScheduledJob {
  id: string
  name: string
  connectionId: string
  jobType: JobType
  cronExpression: string
  config: Record<string, unknown>
  enabled: boolean
  lastRun: string | null
  nextRun: string | null
  createdAt: string
}

export interface CreateScheduledJobDto {
  name: string
  connectionId: string
  jobType: JobType
  cronExpression: string
  config: Record<string, unknown>
}

export interface UpdateScheduledJobDto {
  name?: string
  cronExpression?: string
  config?: Record<string, unknown>
  enabled?: boolean
}

export interface JobCompletedPayload {
  jobId: string
  jobName: string
  status: string
  outputPath: string | null
  error: string | null
  rowsAffected: number | null
}
