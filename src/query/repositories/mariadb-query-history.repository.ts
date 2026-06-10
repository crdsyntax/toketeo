import { Injectable } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { QueryHistoryRepository } from './query-history.repository.interface';
import { QueryHistoryEntity } from '../entities/query-history.entity';

interface HistoryRow {
  id: string;
  connectionId: string;
  userId: string;
  sql: string;
  executionTime: number;
  status: 'SUCCESS' | 'ERROR';
  errorMessage: string | null;
  executedAt: Date;
}

@Injectable()
export class MariaDbQueryHistoryRepository implements QueryHistoryRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'toketeo',
    });
  }

  async save(history: Partial<QueryHistoryEntity>): Promise<void> {
    const sql = `
      INSERT INTO query_history (id, connectionId, userId, \`sql\`, executionTime, status, errorMessage)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const id = crypto.randomUUID();
    await this.pool.execute(sql, [
      id,
      history.connectionId ?? null,
      history.userId ?? null,
      history.sql ?? null,
      history.executionTime ?? 0,
      history.status ?? 'SUCCESS',
      history.errorMessage || null,
    ]);
  }

  async findByConnection(
    connectionId: string,
    limit: number,
    offset: number,
  ): Promise<QueryHistoryEntity[]> {
    const sql =
      'SELECT * FROM query_history WHERE connectionId = ? ORDER BY executedAt DESC LIMIT ? OFFSET ?';
    const [rows] = await this.pool.execute(sql, [connectionId, limit, offset]);
    return (rows as HistoryRow[]).map((row) => this.mapRowToEntity(row));
  }

  async findByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<QueryHistoryEntity[]> {
    const sql =
      'SELECT * FROM query_history WHERE userId = ? ORDER BY executedAt DESC LIMIT ? OFFSET ?';
    const [rows] = await this.pool.execute(sql, [userId, limit, offset]);
    return (rows as HistoryRow[]).map((row) => this.mapRowToEntity(row));
  }

  private mapRowToEntity(row: HistoryRow): QueryHistoryEntity {
    return {
      id: row.id,
      connectionId: row.connectionId,
      userId: row.userId,
      sql: row.sql,
      executionTime: row.executionTime,
      status: row.status,
      errorMessage: row.errorMessage || undefined,
      executedAt: row.executedAt,
    };
  }
}
