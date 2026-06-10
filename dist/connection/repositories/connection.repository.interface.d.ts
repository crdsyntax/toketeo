import { ConnectionEntity } from '../entities/connection.entity';
export interface ConnectionRepository {
    save(connection: Partial<ConnectionEntity>): Promise<ConnectionEntity>;
    findAll(): Promise<ConnectionEntity[]>;
    findById(id: string): Promise<ConnectionEntity | null>;
    delete(id: string): Promise<void>;
}
