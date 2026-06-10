import { AuditEntity } from '../entities/audit.entity';
export interface AuditRepository {
    create(audit: Partial<AuditEntity>): Promise<void>;
    findAll(limit: number, offset: number): Promise<AuditEntity[]>;
    findByUser(userId: string): Promise<AuditEntity[]>;
}
