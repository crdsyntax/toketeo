import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SchemaService } from './schema.service';
import { TableResponseDto, ColumnResponseDto } from './dto/schema-response.dto';

@ApiTags('schema')
@Controller('connections/:connectionId/schema')
export class SchemaController {
  constructor(private readonly schemaService: SchemaService) {}

  @Get('tables')
  @ApiOperation({ summary: 'List all tables in the connection' })
  @ApiResponse({ status: 200, type: [TableResponseDto] })
  async getTables(
    @Param('connectionId') connectionId: string,
  ): Promise<TableResponseDto[]> {
    return this.schemaService.getTables(connectionId);
  }

  @Get('tables/:tableName/columns')
  @ApiOperation({ summary: 'List all columns in a table' })
  @ApiResponse({ status: 200, type: [ColumnResponseDto] })
  async getColumns(
    @Param('connectionId') connectionId: string,
    @Param('tableName') tableName: string,
  ): Promise<ColumnResponseDto[]> {
    return this.schemaService.getColumns(connectionId, tableName);
  }

  @Get('tables/:tableName/ddl')
  @ApiOperation({ summary: 'Get the DDL (CREATE TABLE) of a table' })
  @ApiResponse({ status: 200, type: String })
  async getDDL(
    @Param('connectionId') connectionId: string,
    @Param('tableName') tableName: string,
  ): Promise<{ ddl: string }> {
    const ddl = await this.schemaService.getDDL(connectionId, tableName);
    return { ddl };
  }
}
