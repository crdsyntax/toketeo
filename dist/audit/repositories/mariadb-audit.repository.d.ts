import { AuditRepository } from './audit.repository.interface';
import { AuditEntity } from '../entities/audit.entity';
export declare class MariaDbAuditRepository implements AuditRepository {
    private readonly logger;
    private pool;
    constructor();
    create(audit: Partial<AuditEntity>): Promise<void>;
    findAll(limit: number, offset: number): Promise<AuditEntity[]>;
    findByUser(userId: string): Promise<AuditEntity[]>;
}
