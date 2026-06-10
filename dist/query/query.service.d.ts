import { ConnectionService } from '../connection/connection.service';
import { ExecuteQueryDto, QueryResponseDto } from './dto/query-execution.dto';
import { AuditService } from '../audit/audit.service';
import type { QueryHistoryRepository } from './repositories/query-history.repository.interface';
export declare class QueryService {
    private readonly connectionService;
    private readonly auditService;
    private readonly historyRepository;
    private readonly logger;
    constructor(connectionService: ConnectionService, auditService: AuditService, historyRepository: QueryHistoryRepository);
    execute(connectionId: string, dto: ExecuteQueryDto): Promise<QueryResponseDto>;
}
