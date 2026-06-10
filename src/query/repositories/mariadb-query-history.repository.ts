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
    _connectionId: string,
    _limit: number,
    _offset: number,
  ): Promise<QueryHistoryEntity[]> {
    return Promise.resolve([]);
  }

  async findByUser(
    _userId: string,
    _limit: number,
    _offset: number,
  ): Promise<QueryHistoryEntity[]> {
    return Promise.resolve([]);
  }
}
