import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueryHistoryRepository } from '../../../query/repositories/query-history.repository.interface';
import { QueryHistoryEntity } from '../../../query/entities/query-history.entity';
import { SqliteService } from '../sqlite.service';

@Injectable()
export class SqliteQueryHistoryRepository implements QueryHistoryRepository {
  private readonly logger = new Logger(SqliteQueryHistoryRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  async save(history: Partial<QueryHistoryEntity>): Promise<void> {
    const db = this.sqlite.getDb();
    const stmt = db.prepare(`
      INSERT INTO query_history (id, connection_id, user_id, sql, execution_time, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      history.id || randomUUID(),
      history.connectionId,
      history.userId || 'system',
      history.sql,
      history.executionTime || 0,
      history.status || 'SUCCESS',
      history.errorMessage || null,
    );
  }

  async findByConnection(
    connectionId: string,
    limit: number,
    offset: number,
  ): Promise<QueryHistoryEntity[]> {
    const rows = this.sqlite.getDb().prepare(`
      SELECT * FROM query_history 
      WHERE connection_id = ? 
      ORDER BY executed_at DESC 
      LIMIT ? OFFSET ?
    `).all(connectionId, limit, offset) as any[];

    return rows.map(this.mapToEntity);
  }

  async findByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<QueryHistoryEntity[]> {
    const rows = this.sqlite.getDb().prepare(`
      SELECT * FROM query_history 
      WHERE user_id = ? 
      ORDER BY executed_at DESC 
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset) as any[];

    return rows.map(this.mapToEntity);
  }

  private mapToEntity(row: any): QueryHistoryEntity {
    const entity = new QueryHistoryEntity();
    entity.id = row.id;
    entity.connectionId = row.connection_id;
    entity.userId = row.user_id;
    entity.sql = row.sql;
    entity.executionTime = row.execution_time;
    entity.status = row.status;
    entity.errorMessage = row.error_message || undefined;
    entity.executedAt = new Date(row.executed_at + 'Z');
    return entity;
  }
}
