import { ConnectionService } from '../connection/connection.service';
import { ExecuteQueryDto, QueryResponseDto } from './dto/query-execution.dto';
export declare class QueryService {
    private readonly connectionService;
    private readonly logger;
    constructor(connectionService: ConnectionService);
    execute(connectionId: string, dto: ExecuteQueryDto): Promise<QueryResponseDto>;
    private getDriver;
}
