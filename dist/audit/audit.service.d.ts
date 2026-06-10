import type { AuditRepository } from './repositories/audit.repository.interface';
import { AuditEntity, AuditAction } from './entities/audit.entity';
export declare class AuditService {
    private readonly repository;
    constructor(repository: AuditRepository);
    log(userId: string, action: AuditAction, resource: string, resourceId?: string, metadata?: Record<string, any>): Promise<void>;
    getLogs(limit?: number, offset?: number): Promise<AuditEntity[]>;
}
