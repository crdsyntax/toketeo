import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConnectionService } from '../connection/connection.service';
import { ExecuteQueryDto, QueryResponseDto } from './dto/query-execution.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit.entity';
import type { QueryHistoryRepository } from './repositories/query-history.repository.interface';
import { QueryResultInfo } from '../connection/interfaces/database-driver.interface';

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(
    private readonly connectionService: ConnectionService,
    private readonly auditService: AuditService,
    @Inject('QueryHistoryRepository')
    private readonly historyRepository: QueryHistoryRepository,
  ) {}

  async execute(
    connectionId: string,
    dto: ExecuteQueryDto,
    onProgress?: (status: string) => void,
  ): Promise<QueryResponseDto> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (dto.schema) connection.database = dto.schema;
    const driver = this.connectionService.getDriver(connection);
    const start = Date.now();

    try {
      onProgress?.('connecting');
      await driver.connect();

      if (dto.schema && driver.setSchema) {
        driver.setSchema(dto.schema);
      }

      onProgress?.('executing');
      const result = await driver.executeQuery<
        QueryResultInfo | Record<string, unknown>[]
      >(dto.sql, dto.params);
      const executionTime = Date.now() - start;

      let columns: string[] = [];
      let rows: any[] = [];
      let affectedRows: number | undefined;
      let message: string | undefined;

      // Handle MariaDB/MySQL result format
      if (
        result &&
        typeof result === 'object' &&
        !Array.isArray(result) &&
        'affectedRows' in result
      ) {
        const info = result;
        affectedRows = info.affectedRows;
        message = `Query OK, ${affectedRows ?? 0} rows affected`;
      }
      // Handle Postgres/Drivers returning array of rows
      else if (Array.isArray(result)) {
        rows = result;
        if (rows.length > 0) {
          columns = Object.keys(rows[0] as Record<string, unknown>);
        }
      }

      // Persist history (Success)
      void this.historyRepository.save({
        connectionId,
        userId: 'system',
        sql: dto.sql,
        executionTime,
        status: 'SUCCESS',
      });

      // Auditing
      void this.auditService.log(
        'system',
        AuditAction.EXECUTE_QUERY,
        'database',
        connectionId,
        { sql: dto.sql, executionTime },
      );

      return {
        columns,
        rows,
        executionTime,
        affectedRows,
        message,
      };
    } catch (error: unknown) {
      const executionTime = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Persist history (Error)
      void this.historyRepository.save({
        connectionId,
        userId: 'system',
        sql: dto.sql,
        executionTime,
        status: 'ERROR',
        errorMessage: message,
      });

      throw error;
    } finally {
      await driver.disconnect();
    }
  }

  async cancel(connectionId: string): Promise<void> {
    const connection = await this.connectionService.findEntity(connectionId);
    const driver = this.connectionService.getDriver(connection);
    if (driver.cancelQuery) {
      await driver.cancelQuery();
    }
  }
}
