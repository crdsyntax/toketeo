import { Injectable } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { QueryHistoryRepository } from './query-history.repository.interface';
import { QueryHistoryEntity } from '../entities/query-history.entity';
import { withRetry } from '../../common/utils/retry';

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
  private readonly logger = new Logger(MariaDbQueryHistoryRepository.name);

  constructor() {}

  async save(history: Partial<QueryHistoryEntity>): Promise<void> {
    this.logger.log(`Query History: ${JSON.stringify(history)}`);
    // Persistent storage disabled to avoid custom tables
  }

  async findByConnection(
    connectionId: string,
    limit: number,
    offset: number,
  ): Promise<QueryHistoryEntity[]> {
    return [];
  }

  async findByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<QueryHistoryEntity[]> {
    return [];
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
