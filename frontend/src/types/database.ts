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
