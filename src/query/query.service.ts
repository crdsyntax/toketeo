import { Injectable, Logger } from '@nestjs/common';
import { ConnectionService } from '../connection/connection.service';
import { MariaDbDriver } from '../connection/drivers/mariadb.driver';
import { ExecuteQueryDto, QueryResponseDto } from './dto/query-execution.dto';

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(private readonly connectionService: ConnectionService) {}

  async execute(
    connectionId: string,
    dto: ExecuteQueryDto,
  ): Promise<QueryResponseDto> {
    const driver = await this.getDriver(connectionId);
    const start = Date.now();

    try {
      await driver.connect();
      const rows = await driver.executeQuery<Record<string, unknown>[]>(
        dto.sql,
      );
      const executionTime = Date.now() - start;

      let columns: string[] = [];
      if (Array.isArray(rows) && rows.length > 0) {
        columns = Object.keys(rows[0]);
      }

      return {
        columns,
        rows: Array.isArray(rows) ? rows : [rows],
        executionTime,
      };
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
