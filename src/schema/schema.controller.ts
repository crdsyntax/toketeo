import { Controller, Get, Param, Query, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
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
    @Query('schema') schema?: string,
  ): Promise<TableResponseDto[]> {
    return this.schemaService.getTables(connectionId, schema);
  }

  @Get('schemas')
  @ApiOperation({ summary: 'List all schemas/databases in the connection' })
  @ApiResponse({ status: 200, type: [String] })
  async getSchemas(
    @Param('connectionId') connectionId: string,
  ): Promise<string[]> {
    return this.schemaService.getSchemas(connectionId);
  }

  @Post('switch-schema')
  @ApiOperation({ summary: 'Switch the active schema/database' })
  @ApiResponse({ status: 200 })
  async switchSchema(
    @Param('connectionId') connectionId: string,
    @Body('schema') schema: string,
  ): Promise<void> {
    return this.schemaService.switchSchema(connectionId, schema);
  }

  @Get('views')
  @ApiOperation({ summary: 'List all views in the connection' })
  @ApiResponse({ status: 200, type: [TableResponseDto] })
  async getViews(
    @Param('connectionId') connectionId: string,
    @Query('schema') schema?: string,
  ): Promise<TableResponseDto[]> {
    return this.schemaService.getViews(connectionId, schema);
  }

  @Get('procedures')
  @ApiOperation({ summary: 'List all procedures in the connection' })
  @ApiResponse({ status: 200, type: [TableResponseDto] })
  async getProcedures(
    @Param('connectionId') connectionId: string,
    @Query('schema') schema?: string,
  ): Promise<TableResponseDto[]> {
    return this.schemaService.getProcedures(connectionId, schema);
  }

  @Get('triggers')
  @ApiOperation({ summary: 'List all triggers in the connection' })
  @ApiResponse({ status: 200, type: [TableResponseDto] })
  async getTriggers(
    @Param('connectionId') connectionId: string,
    @Query('schema') schema?: string,
  ): Promise<TableResponseDto[]> {
    return this.schemaService.getTriggers(connectionId, schema);
  }

  @Get('tables/:tableName/columns')
  @ApiOperation({ summary: 'List all columns in a table' })
  @ApiResponse({ status: 200, type: [ColumnResponseDto] })
  async getColumns(
    @Param('connectionId') connectionId: string,
    @Param('tableName') tableName: string,
    @Query('schema') schema?: string,
  ): Promise<ColumnResponseDto[]> {
    return this.schemaService.getColumns(connectionId, tableName, schema);
  }

  @Get('objects/:name/ddl')
  @ApiOperation({ summary: 'Get the DDL/Definition of an object' })
  @ApiResponse({ status: 200, type: String })
  @ApiQuery({ name: 'type', enum: ['table', 'view', 'procedure', 'trigger'], required: false })
  async getDDL(
    @Param('connectionId') connectionId: string,
    @Param('name') name: string,
    @Query('type') type: 'table' | 'view' | 'procedure' | 'trigger' = 'table',
    @Query('schema') schema?: string,
  ): Promise<{ ddl: string }> {
    const ddl = await this.schemaService.getDDL(connectionId, name, type, schema);
    return { ddl };
  }

  @Post('objects/:name/ddl')
  @ApiOperation({ summary: 'Update the DDL/Definition of an object' })
  @ApiResponse({ status: 200 })
  @ApiQuery({ name: 'type', enum: ['table', 'view', 'procedure', 'trigger'], required: true })
  async updateDDL(
    @Param('connectionId') connectionId: string,
    @Param('name') name: string,
    @Query('type') type: 'table' | 'view' | 'procedure' | 'trigger',
    @Query('schema') schema: string,
    @Body('sql') sql: string,
  ): Promise<void> {
    return this.schemaService.updateDDL(connectionId, name, type, sql, schema);
  }

  @Get('objects/:name/parameters')
  @ApiOperation({ summary: 'Get parameters of a procedure, function or view' })
  @ApiResponse({ status: 200, type: [Object] })
  @ApiQuery({ name: 'type', enum: ['procedure', 'function', 'view'], required: true })
  async getParameters(
    @Param('connectionId') connectionId: string,
    @Param('name') name: string,
    @Query('type') type: 'procedure' | 'function' | 'view',
    @Query('schema') schema?: string,
  ): Promise<any[]> {
    return this.schemaService.getParameters(connectionId, name, type, schema);
  }
}
