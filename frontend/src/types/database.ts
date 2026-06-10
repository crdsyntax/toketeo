export enum DatabaseType {
  MARIADB = 'mariadb',
  POSTGRES = 'postgres',
  MONGODB = 'mongodb',
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
