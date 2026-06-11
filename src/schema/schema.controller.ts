import {
  Controller,
  Get,
  Param,
  Query,
  Post,
  Body,
  Delete,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SchemaService } from './schema.service';
import {
  TableResponseDto,
  ColumnResponseDto,
  IndexResponseDto,
  ForeignKeyResponseDto,
  ConstraintResponseDto,
  ParameterResponseDto,
} from './dto/schema-response.dto';
import { ConnectionResponseDto } from '../connection/dto/connection-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';

@ApiTags('schema')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
  @ApiResponse({ status: 200, type: ConnectionResponseDto })
  async switchSchema(
    @Param('connectionId') connectionId: string,
    @Body('schema') schema: string,
  ): Promise<ConnectionResponseDto> {
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

  @Get('tables/:tableName/indexes')
  @ApiOperation({ summary: 'List all indexes in a table' })
  @ApiResponse({ status: 200, type: [IndexResponseDto] })
  async getIndexes(
    @Param('connectionId') connectionId: string,
    @Param('tableName') tableName: string,
    @Query('schema') schema?: string,
  ): Promise<IndexResponseDto[]> {
    return this.schemaService.getIndexes(connectionId, tableName, schema);
  }

  @Get('tables/:tableName/foreign-keys')
  @ApiOperation({ summary: 'List all foreign keys in a table' })
  @ApiResponse({ status: 200, type: [ForeignKeyResponseDto] })
  async getForeignKeys(
    @Param('connectionId') connectionId: string,
    @Param('tableName') tableName: string,
    @Query('schema') schema?: string,
  ): Promise<ForeignKeyResponseDto[]> {
    return this.schemaService.getForeignKeys(connectionId, tableName, schema);
  }

  @Get('tables/:tableName/constraints')
  @ApiOperation({ summary: 'List all constraints in a table' })
  @ApiResponse({ status: 200, type: [ConstraintResponseDto] })
  async getConstraints(
    @Param('connectionId') connectionId: string,
    @Param('tableName') tableName: string,
    @Query('schema') schema?: string,
  ): Promise<ConstraintResponseDto[]> {
    return this.schemaService.getConstraints(connectionId, tableName, schema);
  }

  @Get('objects/:name/ddl')
  @ApiOperation({ summary: 'Get the DDL/Definition of an object' })
  @ApiResponse({ status: 200, type: String })
  @ApiQuery({
    name: 'type',
    enum: ['table', 'view', 'procedure', 'trigger'],
    required: false,
  })
  async getDDL(
    @Param('connectionId') connectionId: string,
    @Param('name') name: string,
    @Query('type') type: 'table' | 'view' | 'procedure' | 'trigger' = 'table',
    @Query('schema') schema?: string,
  ): Promise<{ ddl: string }> {
    const ddl = await this.schemaService.getDDL(
      connectionId,
      name,
      type,
      schema,
    );
    return { ddl };
  }

  @Post('objects/:name/ddl')
  @ApiOperation({ summary: 'Update the DDL/Definition of an object' })
  @ApiResponse({ status: 200 })
  @ApiQuery({
    name: 'type',
    enum: ['table', 'view', 'procedure', 'trigger'],
    required: true,
  })
  async updateDDL(
    @Param('connectionId') connectionId: string,
    @Param('name') name: string,
    @Query('type') type: 'table' | 'view' | 'procedure' | 'trigger',
    @Query('schema') schema: string,
    @Body('sql') sql: string,
  ): Promise<void> {
    return this.schemaService.updateDDL(connectionId, name, type, sql, schema);
  }

  @Post('tables/:tableName/columns')
  @ApiOperation({ summary: 'Add/Update a column in a table' })
  @ApiResponse({ status: 200 })
  async addColumn(
    @Param('connectionId') connectionId: string,
    @Param('tableName') tableName: string,
    @Query('schema') schema: string,
    @Body('sql') sql: string,
  ): Promise<void> {
    return this.schemaService.updateDDL(
      connectionId,
      tableName,
      'table',
      sql,
      schema,
    );
  }

  @Delete('tables/:tableName/columns/:columnName')
  @ApiOperation({ summary: 'Drop a column from a table' })
  @ApiResponse({ status: 200 })
  async dropColumn(
    @Param('connectionId') connectionId: string,
    @Param('tableName') tableName: string,
    @Param('columnName') columnName: string,
    @Query('schema') schema?: string,
  ): Promise<void> {
    return this.schemaService.dropColumn(
      connectionId,
      tableName,
      columnName,
      schema,
    );
  }

  @Delete('tables/:tableName/indexes/:indexName')
  @ApiOperation({ summary: 'Drop an index from a table' })
  @ApiResponse({ status: 200 })
  async dropIndex(
    @Param('connectionId') connectionId: string,
    @Param('tableName') tableName: string,
    @Param('indexName') indexName: string,
    @Query('schema') schema?: string,
  ): Promise<void> {
    return this.schemaService.dropIndex(
      connectionId,
      tableName,
      indexName,
      schema,
    );
  }

  @Delete('tables/:tableName/foreign-keys/:constraintName')
  @ApiOperation({ summary: 'Drop a foreign key from a table' })
  @ApiResponse({ status: 200 })
  async dropForeignKey(
    @Param('connectionId') connectionId: string,
    @Param('tableName') tableName: string,
    @Param('constraintName') constraintName: string,
    @Query('schema') schema?: string,
  ): Promise<void> {
    return this.schemaService.dropForeignKey(
      connectionId,
      tableName,
      constraintName,
      schema,
    );
  }

  @Delete('tables/:tableName/constraints/:constraintName')
  @ApiOperation({ summary: 'Drop a constraint from a table' })
  @ApiResponse({ status: 200 })
  async dropConstraint(
    @Param('connectionId') connectionId: string,
    @Param('tableName') tableName: string,
    @Param('constraintName') constraintName: string,
    @Query('schema') schema?: string,
  ): Promise<void> {
    return this.schemaService.dropConstraint(
      connectionId,
      tableName,
      constraintName,
      schema,
    );
  }

  @Get('objects/:name/parameters')
  @ApiOperation({ summary: 'Get parameters of a procedure, function or view' })
  @ApiResponse({ status: 200, type: [ParameterResponseDto] })
  @ApiQuery({
    name: 'type',
    enum: ['procedure', 'function', 'view'],
    required: true,
  })
  async getParameters(
    @Param('connectionId') connectionId: string,
    @Param('name') name: string,
    @Query('type') type: 'procedure' | 'function' | 'view',
    @Query('schema') schema?: string,
  ): Promise<ParameterResponseDto[]> {
    return this.schemaService.getParameters(connectionId, name, type, schema);
  }
}
