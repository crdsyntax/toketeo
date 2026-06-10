import { QueryHistoryRepository } from './query-history.repository.interface';
import { QueryHistoryEntity } from '../entities/query-history.entity';
export declare class MariaDbQueryHistoryRepository implements QueryHistoryRepository {
    private pool;
    constructor();
    save(history: Partial<QueryHistoryEntity>): Promise<void>;
    findByConnection(connectionId: string, limit: number, offset: number): Promise<QueryHistoryEntity[]>;
    findByUser(userId: string, limit: number, offset: number): Promise<QueryHistoryEntity[]>;
    private mapRowToEntity;
}
