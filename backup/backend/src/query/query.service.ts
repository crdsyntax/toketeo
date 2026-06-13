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

    const page = dto.page || 1;
    const pageSize = dto.pageSize || 1000;
    let sql = dto.sql.trim();
    const params = [...(dto.params || [])];

    const isSelect = /^\s*(SELECT|WITH)\b/i.test(sql);
    const hasLimit = /\bLIMIT\b\s+\d+/i.test(sql);
    let appliedPagination = false;

    if (isSelect && !hasLimit) {
      const offset = (page - 1) * pageSize;
      if (sql.endsWith(';')) {
        sql = sql.slice(0, -1).trim();
      }
      sql = `${sql} LIMIT ${Number(pageSize) + 1} OFFSET ${Number(offset)}`;
      appliedPagination = true;
      this.logger.log(
        `Applied automatic pagination: LIMIT ${pageSize + 1} OFFSET ${offset}`,
      );
    }

    try {
      onProgress?.('connecting');
      await driver.connect();

      if (dto.schema && driver.setSchema) {
        driver.setSchema(dto.schema);
      }

      onProgress?.('executing');
      const result = await driver.executeQuery<
        QueryResultInfo | Record<string, unknown>[]
      >(sql, params);
      const executionTime = Date.now() - start;

      let columns: string[] = [];
      let rows: Record<string, unknown>[] = [];
      let affectedRows: number | undefined;
      let message: string | undefined;
      let hasMore = false;

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

        if (appliedPagination) {
          if (rows.length > pageSize) {
            hasMore = true;
            rows = rows.slice(0, pageSize);
          }
        }

        if (rows.length > 0) {
          columns = Object.keys(rows[0]);
        }
      }

      // Persist history (Success)
      void this.historyRepository.save({
        connectionId,
        userId: 'system',
        sql: dto.sql, // Log original SQL
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
        page: appliedPagination ? page : undefined,
        pageSize: appliedPagination ? pageSize : undefined,
        hasMore: appliedPagination ? hasMore : undefined,
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

  async executeStream(
    connectionId: string,
    dto: ExecuteQueryDto,
    onResult: (data: Partial<QueryResponseDto>) => void,
    onProgress?: (status: string) => void,
  ): Promise<void> {
    const connection = await this.connectionService.findEntity(connectionId);
    if (dto.schema) connection.database = dto.schema;
    const driver = this.connectionService.getDriver(connection);
    const start = Date.now();

    const pageSize = dto.pageSize || 1000;
    const sql = dto.sql.trim();
    const params = dto.params || [];

    try {
      onProgress?.('connecting');
      await driver.connect();

      if (dto.schema && driver.setSchema) {
        driver.setSchema(dto.schema);
      }

      onProgress?.('executing');

      if (!driver.executeQueryStream) {
        // Fallback to regular execute if stream not supported
        const result = await this.execute(connectionId, dto, onProgress);
        onResult(result);
        return;
      }

      const stream = await driver.executeQueryStream(sql, params);
      let chunk: Record<string, unknown>[] = [];
      let totalRows = 0;
      let columns: string[] = [];

      for await (const row of stream) {
        if (totalRows === 0) {
          columns = Object.keys(row);
        }
        chunk.push(row);
        totalRows++;

        if (chunk.length >= pageSize) {
          onResult({
            columns,
            rows: chunk,
            page: Math.floor(totalRows / pageSize),
            pageSize,
            hasMore: true,
          });
          chunk = [];
        }
      }

      const executionTime = Date.now() - start;

      // Final chunk
      onResult({
        columns,
        rows: chunk,
        executionTime,
        page: Math.ceil(totalRows / pageSize) || 1,
        pageSize,
        hasMore: false,
      });

      // Persist history (Success)
      void this.historyRepository.save({
        connectionId,
        userId: 'system',
        sql: dto.sql,
        executionTime,
        status: 'SUCCESS',
      });
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
