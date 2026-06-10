import { SchemaService } from './schema.service';
import { TableResponseDto, ColumnResponseDto } from './dto/schema-response.dto';
export declare class SchemaController {
    private readonly schemaService;
    constructor(schemaService: SchemaService);
    getTables(connectionId: string): Promise<TableResponseDto[]>;
    getColumns(connectionId: string, tableName: string): Promise<ColumnResponseDto[]>;
}
