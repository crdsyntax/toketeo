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
}

export type DbValue = string | number | boolean | null | undefined;
export type DbRow = Record<string, DbValue>;

export interface QueryResult {
  columns: string[];
  rows: DbRow[];
  executionTime: number;
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

export interface DatabaseObject {
  name: string;
  type: 'table' | 'view' | 'procedure' | 'trigger';
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
  database: string
  ssh?: SshConfig
  createdAt: string
  updatedAt: string
}

export type CreateConnectionDto = Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>
