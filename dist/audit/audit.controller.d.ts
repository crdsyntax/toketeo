import type { Response } from 'express';
import { AuditService } from './audit.service';
export declare class AuditController {
    private readonly auditService;
    constructor(auditService: AuditService);
    getLogs(limit?: number, offset?: number): Promise<import("./entities/audit.entity").AuditEntity[]>;
    exportJson(res: Response): Promise<Response<any, Record<string, any>>>;
    exportCsv(res: Response): Promise<Response<any, Record<string, any>>>;
}
