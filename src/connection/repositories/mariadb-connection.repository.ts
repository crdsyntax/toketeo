import { Injectable, Logger } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { ConnectionRepository } from './connection.repository.interface';
import { ConnectionEntity } from '../entities/connection.entity';

@Injectable()
export class MariaDbConnectionRepository implements ConnectionRepository {
  private readonly logger = new Logger(MariaDbConnectionRepository.name);
  private pool: mysql.Pool;

  constructor() {
    // Note: Connection details for the app's own DB should come from ConfigService
    // For now, initializing with placeholders or environment variables
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
      INSERT INTO connections (id, name, type, host, port, user, password, database)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        host = VALUES(host),
        port = VALUES(port),
        user = VALUES(user),
        password = VALUES(password),
        database = VALUES(database),
        updatedAt = CURRENT_TIMESTAMP
    `;
    
    await this.pool.execute(sql, [
      id,
      connection.name,
      connection.type,
      connection.host,
      connection.port,
      connection.user,
      connection.password,
      connection.database,
    ]);

    return this.findById(id) as Promise<ConnectionEntity>;
  }

  async findAll(): Promise<ConnectionEntity[]> {
    const sql = 'SELECT id, name, type, host, port, user, database, createdAt, updatedAt FROM connections';
    const [rows] = await this.pool.execute(sql);
    return rows as ConnectionEntity[];
  }

  async findById(id: string): Promise<ConnectionEntity | null> {
    const sql = 'SELECT id, name, type, host, port, user, database, createdAt, updatedAt FROM connections WHERE id = ?';
    const [rows] = await this.pool.execute(sql, [id]);
    const connections = rows as ConnectionEntity[];
    return connections.length > 0 ? connections[0] : null;
  }

  async delete(id: string): Promise<void> {
    const sql = 'DELETE FROM connections WHERE id = ?';
    await this.pool.execute(sql, [id]);
  }
}
