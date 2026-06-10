import { ConnectionRepository } from './connection.repository.interface';
import { ConnectionEntity } from '../entities/connection.entity';
export declare class MariaDbConnectionRepository implements ConnectionRepository {
    private readonly logger;
    private pool;
    constructor();
    save(connection: Partial<ConnectionEntity>): Promise<ConnectionEntity>;
    findAll(): Promise<ConnectionEntity[]>;
    findById(id: string): Promise<ConnectionEntity | null>;
    delete(id: string): Promise<void>;
    private mapRowToEntity;
}
