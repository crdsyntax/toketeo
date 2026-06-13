import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueryHistoryRepository } from '../../../query/repositories/query-history.repository.interface';
import { QueryHistoryEntity } from '../../../query/entities/query-history.entity';
import { SqliteService } from '../sqlite.service';

interface QueryHistoryRow {
  id: string;
  connection_id: string;
  user_id: string;
  sql: string;
  execution_time: number;
  status: string;
  error_message: string | null;
  executed_at: string;
}

@Injectable()
export class SqliteQueryHistoryRepository implements QueryHistoryRepository {
  private readonly logger = new Logger(SqliteQueryHistoryRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  async save(history: Partial<QueryHistoryEntity>): Promise<void> {
    const client = this.sqlite.getClient();
    await client.execute({
      sql: `
        INSERT INTO query_history (id, connection_id, user_id, sql, execution_time, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        history.id || randomUUID(),
        history.connectionId || '',
        history.userId || 'system',
        history.sql || '',
        history.executionTime || 0,
        history.status || 'SUCCESS',
        history.errorMessage || null,
      ],
    });
  }

  async findByConnection(
    connectionId: string,
    limit: number,
    offset: number,
  ): Promise<QueryHistoryEntity[]> {
    const rs = await this.sqlite.getClient().execute({
      sql: `
        SELECT * FROM query_history 
        WHERE connection_id = ? 
        ORDER BY executed_at DESC 
        LIMIT ? OFFSET ?
      `,
      args: [connectionId, limit, offset],
    });

    return rs.rows.map((row) =>
      this.mapToEntity(row as unknown as QueryHistoryRow),
    );
  }

  async findByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<QueryHistoryEntity[]> {
    const rs = await this.sqlite.getClient().execute({
      sql: `
        SELECT * FROM query_history 
        WHERE user_id = ? 
        ORDER BY executed_at DESC 
        LIMIT ? OFFSET ?
      `,
      args: [userId, limit, offset],
    });

    return rs.rows.map((row) =>
      this.mapToEntity(row as unknown as QueryHistoryRow),
    );
  }

  private mapToEntity(row: QueryHistoryRow): QueryHistoryEntity {
    const entity = new QueryHistoryEntity();
    entity.id = row.id;
    entity.connectionId = row.connection_id;
    entity.userId = row.user_id;
    entity.sql = row.sql;
    entity.executionTime = Number(row.execution_time);
    const status =
      row.status === 'SUCCESS' || row.status === 'ERROR'
        ? row.status
        : 'SUCCESS';
    entity.status = status;
    entity.errorMessage = row.error_message || undefined;
    entity.executedAt = new Date(row.executed_at + 'Z');
    return entity;
  }
}
