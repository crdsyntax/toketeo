import { Injectable } from '@nestjs/common';
import { ConnectionService } from '../connection/connection.service';
import { TableResponseDto, ColumnResponseDto } from './dto/schema-response.dto';

interface NormalizedColumn {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
}

@Injectable()
export class SchemaService {
  constructor(private readonly connectionService: ConnectionService) {}

  async getTables(connectionId: string): Promise<TableResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    const driver = this.connectionService.getDriver(connection);
    try {
      await driver.connect();
      const tables = await driver.getTables();
      return tables.map((name) => ({ name }));
    } finally {
      await driver.disconnect();
    }
  }

  async getViews(connectionId: string): Promise<TableResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
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

  async getProcedures(connectionId: string): Promise<TableResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
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

  async getTriggers(connectionId: string): Promise<TableResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
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

  async getParameters(
    connectionId: string,
    name: string,
    type: 'procedure' | 'function' | 'view',
  ): Promise<any[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    const driver = this.connectionService.getDriver(connection);
    if (!driver.getParameters) return [];
    try {
      await driver.connect();
      return await driver.getParameters(name, type);
    } finally {
      await driver.disconnect();
    }
  }

  async updateDDL(
    connectionId: string,
    name: string,
    type: 'table' | 'view' | 'procedure' | 'trigger',
    sql: string,
  ): Promise<void> {
    const connection = await this.connectionService.findEntity(connectionId);
    const driver = this.connectionService.getDriver(connection);
    try {
      await driver.connect();
      // For views, procedures, triggers: we usually need to DROP and then CREATE or use CREATE OR REPLACE
      // For simplicity, we execute the SQL provided, assuming it's the correct DROP/CREATE or ALTER
      await driver.executeQuery(sql);
    } finally {
      await driver.disconnect();
    }
  }

  async getColumns(
    connectionId: string,
    tableName: string,
  ): Promise<ColumnResponseDto[]> {
    const connection = await this.connectionService.findEntity(connectionId);
    const driver = this.connectionService.getDriver(connection);
    try {
      await driver.connect();
      const columns = (await driver.getColumns(
        tableName,
      )) as NormalizedColumn[];
      return columns.map((col) => ({
        name: col.COLUMN_NAME,
        type: col.DATA_TYPE,
        isNullable: col.IS_NULLABLE === 'YES',
      }));
    } finally {
      await driver.disconnect();
    }
  }

  async getDDL(
    connectionId: string,
    name: string,
    type: 'table' | 'view' | 'procedure' | 'trigger',
  ): Promise<string> {
    const connection = await this.connectionService.findEntity(connectionId);
    const driver = this.connectionService.getDriver(connection);
    try {
      await driver.connect();
      return await driver.getDDL(name, type);
    } finally {
      await driver.disconnect();
    }
  }
}
