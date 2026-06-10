import { Injectable, Logger } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { ConnectionRepository } from './connection.repository.interface';
import { ConnectionEntity } from '../entities/connection.entity';
import { DatabaseType, SshConfigDto } from '../dto/create-connection.dto';
import { withRetry } from '../../common/utils/retry';

interface DbRow {
  Server_name: string;
  Host: string;
  Db: string;
  Username: string;
  Password?: string;
  Port: number;
  Wrapper: string;
  Options: string; // JSON string in MariaDB for mysql.servers
}

@Injectable()
export class MariaDbConnectionRepository implements ConnectionRepository {
  private readonly logger = new Logger(MariaDbConnectionRepository.name);
  private pool: mysql.Pool | null = null;

  private getPool(): mysql.Pool {
    if (!this.pool) {
      this.pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'mysql',
        waitForConnections: true,
        connectionLimit: 10,
      });
    }
    return this.pool;
  }

  async save(connection: Partial<ConnectionEntity>): Promise<ConnectionEntity> {
    const id = connection.id || crypto.randomUUID();
    const options = JSON.stringify({
      name: connection.name,
      type: connection.type,
      ssh: connection.ssh,
    });

    const sql = `
      INSERT INTO mysql.servers (Server_name, Host, Db, Username, Password, Port, Wrapper, Options)
      VALUES (?, ?, ?, ?, ?, ?, 'mysql', ?)
      ON DUPLICATE KEY UPDATE
        Host = VALUES(Host),
        Db = VALUES(Db),
        Username = VALUES(Username),
        Password = VALUES(Password),
        Port = VALUES(Port),
        Options = VALUES(Options)
    `;

    await withRetry(
      () =>
        this.getPool().execute(sql, [
          id,
          connection.host ?? 'localhost',
          connection.database ?? '',
          connection.user ?? 'root',
          connection.password ?? '',
          connection.port ?? 3306,
          options,
        ]),
      3,
      1000,
      'Save connection',
    );

    const result = await this.findById(id);
    if (!result) {
      throw new Error('Failed to retrieve saved connection');
    }
    return result;
  }

  async findAll(): Promise<ConnectionEntity[]> {
    const sql =
      'SELECT Server_name, Host, Db, Username, Password, Port, Wrapper, Options FROM mysql.servers';
    const [rows] = await withRetry(
      () => this.getPool().execute(sql),
      3,
      1000,
      'Find all connections',
    );
    return (rows as DbRow[]).map((row) => this.mapRowToEntity(row));
  }

  async findById(id: string): Promise<ConnectionEntity | null> {
    const sql =
      'SELECT Server_name, Host, Db, Username, Password, Port, Wrapper, Options FROM mysql.servers WHERE Server_name = ?';
    const [rows] = await withRetry(
      () => this.getPool().execute(sql, [id]),
      3,
      1000,
      'Find connection by ID',
    );
    const connections = rows as DbRow[];
    if (connections.length === 0) return null;

    return this.mapRowToEntity(connections[0]);
  }

  async delete(id: string): Promise<void> {
    const sql = 'DELETE FROM mysql.servers WHERE Server_name = ?';

    await withRetry(
      () => this.getPool().execute(sql, [id]),
      3,
      1000,
      'Delete connection',
    );
  }

  private mapRowToEntity(row: DbRow): ConnectionEntity {
    let options: { name?: string; type?: string; ssh?: SshConfigDto } = {};
    try {
      options = JSON.parse(row.Options || '{}') as typeof options;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      this.logger.error(
        `Failed to parse options for ${row.Server_name}: ${message}`,
      );
    }

    return {
      id: row.Server_name,
      name: options.name || row.Server_name,
      type: (options.type as DatabaseType) || DatabaseType.MARIADB,
      host: row.Host,
      port: row.Port,
      user: row.Username,
      password: row.Password,
      database: row.Db,
      ssh: options.ssh,
      createdAt: new Date(), // mysql.servers doesn't have timestamps
      updatedAt: new Date(),
    };
  }
}
