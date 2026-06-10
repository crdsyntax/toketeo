import { Injectable } from '@nestjs/common';
import { ConnectionService } from '../connection/connection.service';
import { MariaDbDriver } from '../connection/drivers/mariadb.driver';
import { TableResponseDto, ColumnResponseDto } from './dto/schema-response.dto';

@Injectable()
export class SchemaService {
  constructor(private readonly connectionService: ConnectionService) {}

  async getTables(connectionId: string): Promise<TableResponseDto[]> {
    const driver = await this.getDriver(connectionId);
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
    const driver = await this.getDriver(connectionId);
    try {
      await driver.connect();
      const columns = await driver.getColumns(tableName);
      return columns.map((col) => ({
        name: col.COLUMN_NAME,
        type: col.DATA_TYPE,
        isNullable: col.IS_NULLABLE === 'YES',
      }));
    } finally {
      await driver.disconnect();
    }
  }

  private async getDriver(connectionId: string): Promise<MariaDbDriver> {
    const connection = await this.connectionService.findOne(connectionId);
    return new MariaDbDriver({
      host: connection.host,
      port: connection.port,
      user: connection.user,
      database: connection.database,
    });
  }
}
