import { ConnectionService } from '../connection/connection.service';
import { TableResponseDto, ColumnResponseDto } from './dto/schema-response.dto';
export declare class SchemaService {
    private readonly connectionService;
    constructor(connectionService: ConnectionService);
    getTables(connectionId: string): Promise<TableResponseDto[]>;
    getColumns(connectionId: string, tableName: string): Promise<ColumnResponseDto[]>;
    private getDriver;
}
