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
    const connection = await this.connectionService.findOne(connectionId);
    const driver = this.connectionService.getDriver(connection);
    try {
      await driver.connect();
      const tables = await driver.getTables();
      return tables.map((name) => ({ name }));
    } finally {
      await driver.disconnect();
    }
  }

  async getColumns(
    connectionId: string,
    tableName: string,
  ): Promise<ColumnResponseDto[]> {
    const connection = await this.connectionService.findOne(connectionId);
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

  async getDDL(connectionId: string, tableName: string): Promise<string> {
    const connection = await this.connectionService.findOne(connectionId);
    const driver = this.connectionService.getDriver(connection);
    try {
      await driver.connect();
      return await driver.getDDL(tableName);
    } finally {
      await driver.disconnect();
    }
  }
}
