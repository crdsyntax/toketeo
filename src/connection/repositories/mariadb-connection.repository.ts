import { Injectable, Logger } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { ConnectionRepository } from './connection.repository.interface';
import { ConnectionEntity } from '../entities/connection.entity';
import { DatabaseType, SshConfigDto } from '../dto/create-connection.dto';

interface DbRow {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  user: string;
  database: string;
  ssh: string | null | Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MariaDbConnectionRepository implements ConnectionRepository {
  private readonly logger = new Logger(MariaDbConnectionRepository.name);
  private pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'toketeo',
      waitForConnections: true,
      connectionLimit: 10,
    });
  }

  async save(connection: Partial<ConnectionEntity>): Promise<ConnectionEntity> {
    const id = connection.id || crypto.randomUUID();
    const sql = `
      INSERT INTO connections (id, name, type, host, port, user, password, database, ssh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        host = VALUES(host),
        port = VALUES(port),
        user = VALUES(user),
        password = VALUES(password),
        database = VALUES(database),
        ssh = VALUES(ssh),
        updatedAt = CURRENT_TIMESTAMP
    `;

    await this.pool.execute(sql, [
      id,
      connection.name ?? null,
      connection.type ?? null,
      connection.host ?? null,
      connection.port ?? null,
      connection.user ?? null,
      connection.password ?? null,
      connection.database ?? null,
      connection.ssh ? JSON.stringify(connection.ssh) : null,
    ]);

    const result = await this.findById(id);
    if (!result) {
      throw new Error('Failed to retrieve saved connection');
    }
    return result;
  }

  async findAll(): Promise<ConnectionEntity[]> {
    const sql =
      'SELECT id, name, type, host, port, user, database, ssh, createdAt, updatedAt FROM connections';
    const [rows] = await this.pool.execute(sql);
    return (rows as DbRow[]).map((row) => this.mapRowToEntity(row));
  }

  async findById(id: string): Promise<ConnectionEntity | null> {
    const sql =
      'SELECT id, name, type, host, port, user, database, ssh, createdAt, updatedAt FROM connections WHERE id = ?';
    const [rows] = await this.pool.execute(sql, [id]);
    const connections = rows as DbRow[];
    if (connections.length === 0) return null;

    return this.mapRowToEntity(connections[0]);
  }

  async delete(id: string): Promise<void> {
    const sql = 'DELETE FROM connections WHERE id = ?';
    await this.pool.execute(sql, [id]);
  }

  private mapRowToEntity(row: DbRow): ConnectionEntity {
    return {
      id: row.id,
      name: row.name,
      type: row.type as DatabaseType,
      host: row.host,
      port: row.port,
      user: row.user,
      database: row.database,
      ssh: row.ssh
        ? ((typeof row.ssh === 'string'
            ? JSON.parse(row.ssh)
            : row.ssh) as SshConfigDto)
        : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
