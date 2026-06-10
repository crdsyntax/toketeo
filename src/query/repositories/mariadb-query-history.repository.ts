import { Injectable, Logger } from '@nestjs/common';
import { QueryHistoryRepository } from './query-history.repository.interface';
import { QueryHistoryEntity } from '../entities/query-history.entity';

@Injectable()
export class MariaDbQueryHistoryRepository implements QueryHistoryRepository {
  private readonly logger = new Logger(MariaDbQueryHistoryRepository.name);

  constructor() {}

  async save(history: Partial<QueryHistoryEntity>): Promise<void> {
    this.logger.log(`Query History: ${JSON.stringify(history)}`);
    return Promise.resolve();
  }

  async findByConnection(
    connectionId: string,
    limit: number,
    offset: number,
  ): Promise<QueryHistoryEntity[]> {
    this.logger.log(
      `findByConnection: ${connectionId}, limit: ${limit}, offset: ${offset}`,
    );
    return Promise.resolve([]);
  }

  async findByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<QueryHistoryEntity[]> {
    this.logger.log(
      `findByUser: ${userId}, limit: ${limit}, offset: ${offset}`,
    );
    return Promise.resolve([]);
  }
}
