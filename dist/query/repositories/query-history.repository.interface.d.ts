import { QueryHistoryEntity } from '../entities/query-history.entity';
export interface QueryHistoryRepository {
    save(history: Partial<QueryHistoryEntity>): Promise<void>;
    findByConnection(connectionId: string, limit: number, offset: number): Promise<QueryHistoryEntity[]>;
    findByUser(userId: string, limit: number, offset: number): Promise<QueryHistoryEntity[]>;
}
