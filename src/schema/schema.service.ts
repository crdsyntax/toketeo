import { Injectable } from '@nestjs/common';
import { ConnectionService } from '../connection/connection.service';
import {
  TableResponseDto,
  ColumnResponseDto,
  IndexResponseDto,
} from './dto/schema-response.dto';
import { ConnectionResponseDto } from '../connection/dto/connection-response.dto';
import { DatabaseType } from '../connection/dto/create-connection.dto';
import {
  IndexMetadata,
  ForeignKeyMetadata,
  ConstraintMetadata,
  ParameterMetadata,
} from '../connection/interfaces/database-driver.interface';

@Injectable()
export class SchemaService {
  constructor(private readonly connectionService: ConnectionService) {}

  async getTables(
    connectionId: string,
    schema?: string,
  ): Promise<TableResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    try {
      await driver.connect();
      if (schema && driver.setSchema) {
        driver.setSchema(schema);
      }
      const tables = await driver.getTables();
      return tables.map((name) => ({ name }));
    } finally {
      await driver.disconnect();
    }
  }

  async getSchemas(connectionId: string): Promise<string[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getSchemas)
      return connection.database ? [connection.database] : [];
    try {
      await driver.connect();
      return await driver.getSchemas();
    } finally {
      await driver.disconnect();
    }
  }

  async switchSchema(
    connectionId: string,
    schema: string,
  ): Promise<ConnectionResponseDto> {
    const updated = await this.connectionService.update(connectionId, {
      database: schema,
    });
    return updated;
  }

  async getViews(
    connectionId: string,
    schema?: string,
  ): Promise<TableResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getViews) return [];
    try {
      await driver.connect();
      if (schema && driver.setSchema) {
        driver.setSchema(schema);
      }
      const views = await driver.getViews();
      return views.map((name) => ({ name }));
    } finally {
      await driver.disconnect();
    }
  }

  async getProcedures(
    connectionId: string,
    schema?: string,
  ): Promise<TableResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getProcedures) return [];
    try {
      await driver.connect();
      if (schema && driver.setSchema) {
        driver.setSchema(schema);
      }
      const procedures = await driver.getProcedures();
      return procedures.map((name) => ({ name }));
    } finally {
      await driver.disconnect();
    }
  }

  async getTriggers(
    connectionId: string,
    schema?: string,
  ): Promise<TableResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getTriggers) return [];
    try {
      await driver.connect();
      if (schema && driver.setSchema) {
        driver.setSchema(schema);
      }
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
      if (schema && driver.setSchema) {
        driver.setSchema(schema);
      }
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
      if (schema && driver.setSchema) {
        driver.setSchema(schema);
      }
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
  ): Promise<ParameterMetadata[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getParameters) return [];
    try {
      await driver.connect();
      if (schema && driver.setSchema) {
        driver.setSchema(schema);
      }
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
      if (schema && driver.setSchema) {
        driver.setSchema(schema);
      }
      const columns = await driver.getColumns(tableName);
      return columns.map((col) => ({
        name: col.name,
        type: col.type,
        isNullable: col.isNullable,
      }));
    } finally {
      await driver.disconnect();
    }
  }

  async getIndexes(
    connectionId: string,
    tableName: string,
    schema?: string,
  ): Promise<IndexResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getIndexes) return [];
    try {
      await driver.connect();
      if (schema && driver.setSchema) {
        driver.setSchema(schema);
      }
      const indexes = await driver.getIndexes(tableName);
      return indexes.map((idx) => ({
        name: idx.name,
        column: idx.column,
        isUnique: idx.isUnique,
        type: idx.type,
        targetColumn: idx.targetColumn,
      }));
    } finally {
      await driver.disconnect();
    }
  }

  async getForeignKeys(
    connectionId: string,
    tableName: string,
    schema?: string,
  ): Promise<ForeignKeyMetadata[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getForeignKeys) return [];
    try {
      await driver.connect();
      if (schema && driver.setSchema) {
        driver.setSchema(schema);
      }
      return await driver.getForeignKeys(tableName);
    } finally {
      await driver.disconnect();
    }
  }

  async getConstraints(
    connectionId: string,
    tableName: string,
    schema?: string,
  ): Promise<ConstraintMetadata[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getConstraints) return [];
    try {
      await driver.connect();
      if (schema && driver.setSchema) {
        driver.setSchema(schema);
      }
      return await driver.getConstraints(tableName);
    } finally {
      await driver.disconnect();
    }
  }

  async dropColumn(
    connectionId: string,
    tableName: string,
    columnName: string,
    schema?: string,
  ): Promise<void> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);
    const sql = `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``;
    try {
      await driver.connect();
      if (schema && driver.setSchema) driver.setSchema(schema);
      await driver.executeQuery(sql);
    } finally {
      await driver.disconnect();
    }
  }

  async dropIndex(
    connectionId: string,
    tableName: string,
    indexName: string,
    schema?: string,
  ): Promise<void> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);

    let sql = `ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``;
    if (connection.type === DatabaseType.POSTGRES) {
      sql = `DROP INDEX "${indexName}"`;
    }

    try {
      await driver.connect();
      if (schema && driver.setSchema) driver.setSchema(schema);
      await driver.executeQuery(sql);
    } finally {
      await driver.disconnect();
    }
  }

  async renameIndex(
    connectionId: string,
    tableName: string,
    oldIndexName: string,
    newIndexName: string,
    schema?: string,
  ): Promise<void> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);

    let sql = `ALTER TABLE \`${tableName}\` RENAME INDEX \`${oldIndexName}\` TO \`${newIndexName}\``;
    if (connection.type === DatabaseType.POSTGRES) {
      sql = `ALTER INDEX "${oldIndexName}" RENAME TO "${newIndexName}"`;
    }

    try {
      await driver.connect();
      if (schema && driver.setSchema) driver.setSchema(schema);
      await driver.executeQuery(sql);
    } finally {
      await driver.disconnect();
    }
  }

  async dropForeignKey(
    connectionId: string,
    tableName: string,
    constraintName: string,
    schema?: string,
  ): Promise<void> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);

    let sql = `ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${constraintName}\``;
    if (connection.type === DatabaseType.POSTGRES) {
      sql = `ALTER TABLE "${tableName}" DROP CONSTRAINT "${constraintName}"`;
    }

    try {
      await driver.connect();
      if (schema && driver.setSchema) driver.setSchema(schema);
      await driver.executeQuery(sql);
    } finally {
      await driver.disconnect();
    }
  }

  async dropConstraint(
    connectionId: string,
    tableName: string,
    constraintName: string,
    schema?: string,
  ): Promise<void> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (schema) connection.database = schema;
    const driver = this.connectionService.getDriver(connection);

    const sql = `ALTER TABLE \`${tableName}\` DROP CONSTRAINT \`${constraintName}\``;

    try {
      await driver.connect();
      if (schema && driver.setSchema) driver.setSchema(schema);
      await driver.executeQuery(sql);
    } finally {
      await driver.disconnect();
    }
  }
}
