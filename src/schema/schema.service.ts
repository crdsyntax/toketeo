import { Injectable } from '@nestjs/common';
import { ConnectionService } from '../connection/connection.service';
import { TableResponseDto, ColumnResponseDto } from './dto/schema-response.dto';

@Injectable()
export class SchemaService {
  constructor(private readonly connectionService: ConnectionService) {}

  async getTables(connectionId: string, schema?: string): Promise<TableResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    try {
      await driver.connect();
      const tables = await driver.getTables();
      return tables.map((name) => ({ name }));
    } finally {
      await driver.disconnect();
    }
  }

  async getSchemas(connectionId: string): Promise<string[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getSchemas) return [connection.database];
    try {
      await driver.connect();
      return await driver.getSchemas();
    } finally {
      await driver.disconnect();
    }
  }

  async switchSchema(connectionId: string, schema: string): Promise<void> {
    const connection = await this.connectionService.findEntity(connectionId);
    const driver = this.connectionService.getDriver(connection);
    if (driver.setSchema) {
      driver.setSchema(schema);
    }
  }

  async getViews(connectionId: string, schema?: string): Promise<TableResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getViews) return [];
    try {
      await driver.connect();
      const views = await driver.getViews();
      return views.map((name) => ({ name }));
    } finally {
      await driver.disconnect();
    }
  }

  async getProcedures(connectionId: string, schema?: string): Promise<TableResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getProcedures) return [];
    try {
      await driver.connect();
      const procedures = await driver.getProcedures();
      return procedures.map((name) => ({ name }));
    } finally {
      await driver.disconnect();
    }
  }

  async getTriggers(connectionId: string, schema?: string): Promise<TableResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getTriggers) return [];
    try {
      await driver.connect();
      const triggers = await driver.getTriggers();
      return triggers.map((name) => ({ name }));
    } finally {
      await driver.disconnect();
    }
  }

  async updateDDL(
    connectionId: string,
    name: string,
    type: 'table' | 'view' | 'procedure' | 'trigger',
    sql: string,
    schema?: string,
  ): Promise<void> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    try {
      await driver.connect();
      await driver.executeQuery(sql);
    } finally {
      await driver.disconnect();
    }
  }

  async getDDL(
    connectionId: string,
    name: string,
    type: 'table' | 'view' | 'procedure' | 'trigger',
    schema?: string,
  ): Promise<string> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    try {
      await driver.connect();
      return await driver.getDDL(name, type);
    } finally {
      await driver.disconnect();
    }
  }

  async getParameters(
    connectionId: string,
    name: string,
    type: 'procedure' | 'function' | 'view',
    schema?: string,
  ): Promise<any[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getParameters) return [];
    try {
      await driver.connect();
      return await driver.getParameters(name, type);
    } finally {
      await driver.disconnect();
    }
  }

  async getColumns(
    connectionId: string,
    tableName: string,
    schema?: string,
  ): Promise<ColumnResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    try {
      await driver.connect();
      const columns = await driver.getColumns(tableName);
      return columns.map((col: any) => ({
        name: col.COLUMN_NAME || col.column_name,
        type: col.DATA_TYPE || col.data_type,
        isNullable:
          (col.IS_NULLABLE || col.is_nullable) === 'YES' ||
          (col.IS_NULLABLE || col.is_nullable) === 'true',
      }));
    } finally {
      await driver.disconnect();
    }
  }
}
