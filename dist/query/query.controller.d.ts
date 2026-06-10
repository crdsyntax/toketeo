import { QueryService } from './query.service';
import { ExecuteQueryDto, QueryResponseDto } from './dto/query-execution.dto';
export declare class QueryController {
    private readonly queryService;
    constructor(queryService: QueryService);
    execute(connectionId: string, dto: ExecuteQueryDto): Promise<QueryResponseDto>;
}
