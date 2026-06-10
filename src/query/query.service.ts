import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConnectionService } from '../connection/connection.service';
import { ExecuteQueryDto, QueryResponseDto } from './dto/query-execution.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit.entity';
import type { QueryHistoryRepository } from './repositories/query-history.repository.interface';

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
  ): Promise<QueryResponseDto> {
    const connection = await this.connectionService.findEntity(connectionId);
    const driver = this.connectionService.getDriver(connection);
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
        rows: Array.isArray(rows) ? rows : [rows],
        executionTime,
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
}
