import * as mssql from 'mssql';
import {
  DatabaseDriver,
  ColumnMetadata,
  IndexMetadata,
  ForeignKeyMetadata,
  ConstraintMetadata,
  ParameterMetadata,
} from '../interfaces/database-driver.interface';
import { SshConfigDto } from '../dto/create-connection.dto';
import { SshTunnel } from '../utils/ssh-tunnel';

export class SqlServerDriver implements DatabaseDriver {
  private pool: mssql.ConnectionPool | null = null;
  private tunnel: SshTunnel | null = null;
  private currentDatabase: string;

  constructor(
    private readonly config: mssql.config,
    private readonly sshConfig?: SshConfigDto,
  ) {
    this.currentDatabase = config.database || '';
  }

  async connect(): Promise<void> {
    let connectionConfig = { ...this.config };

    if (this.sshConfig) {
      this.tunnel = new SshTunnel();
      const { host, port } = await this.tunnel.create(
        this.sshConfig,
        this.config.server || 'localhost',
        this.config.port || 1433,
      );
      connectionConfig = {
        ...connectionConfig,
        server: host,
        port,
        options: {
          ...connectionConfig.options,
          encrypt: false, // Often needed for local/tunnel connections
          trustServerCertificate: true,
        }
      };
    }

    this.pool = await new mssql.ConnectionPool(connectionConfig).connect();
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
    if (this.tunnel) {
      this.tunnel.close();
      this.tunnel = null;
    }
  }

  async executeQuery<T>(sql: string, params?: unknown[]): Promise<T> {
    if (!this.pool) {
      throw new Error('Driver not connected');
    }
    const request = this.pool.request();
    if (params) {
      params.forEach((param, index) => {
        request.input(`p${index}`, param);
      });
    }
    const result = await request.query(sql);
    return result.recordset as unknown as T;
  }

  async getTables(): Promise<string[]> {
    const rows = await this.executeQuery<{ TABLE_NAME: string }[]>(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_CATALOG = @p0 AND TABLE_TYPE = 'BASE TABLE'",
      [this.currentDatabase],
    );
    return rows.map((row) => row.TABLE_NAME);
  }

  async getSchemas(): Promise<string[]> {
    const rows = await this.executeQuery<{ name: string }[]>(
      'SELECT name FROM sys.databases WHERE database_id > 4',
    );
    return rows.map((row) => row.name);
  }

  setSchema(schema: string): void {
    this.currentDatabase = schema;
    // In MSSQL we don't necessarily "USE" but we can store it for context
  }

  async getViews(): Promise<string[]> {
    const rows = await this.executeQuery<{ TABLE_NAME: string }[]>(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_CATALOG = @p0 AND TABLE_TYPE = 'VIEW'",
      [this.currentDatabase],
    );
    return rows.map((row) => row.TABLE_NAME);
  }

  async getProcedures(): Promise<string[]> {
    const rows = await this.executeQuery<{ ROUTINE_NAME: string }[]>(
      "SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE TABLE_CATALOG = @p0 AND ROUTINE_TYPE = 'PROCEDURE'",
      [this.currentDatabase],
    );
    return rows.map((row) => row.ROUTINE_NAME);
  }

  async getTriggers(): Promise<string[]> {
    const rows = await this.executeQuery<{ name: string }[]>(
      "SELECT name FROM sys.triggers",
    );
    return rows.map((row) => row.name);
  }

  async getParameters(
    name: string,
    type: 'procedure' | 'function' | 'view',
  ): Promise<ParameterMetadata[]> {
    if (type === 'view') return [];

    const rows = await this.executeQuery<
      {
        PARAMETER_NAME: string;
        DATA_TYPE: string;
        PARAMETER_MODE: string;
      }[]
    >(
      `SELECT PARAMETER_NAME, DATA_TYPE, PARAMETER_MODE 
       FROM INFORMATION_SCHEMA.PARAMETERS 
       WHERE SPECIFIC_CATALOG = @p0 AND SPECIFIC_NAME = @p1
       ORDER BY ORDINAL_POSITION`,
      [this.currentDatabase, name],
    );

    return rows.map((row) => ({
      name: row.PARAMETER_NAME,
      type: row.DATA_TYPE,
      mode: row.PARAMETER_MODE === 'IN' ? 'IN' : row.PARAMETER_MODE === 'OUT' ? 'OUT' : 'INOUT',
    }));
  }

  async getColumns(table: string): Promise<ColumnMetadata[]> {
    const rows = await this.executeQuery<
      {
        COLUMN_NAME: string;
        DATA_TYPE: string;
        IS_NULLABLE: string;
        COLUMN_DEFAULT: string | null;
        CHARACTER_MAXIMUM_LENGTH: number | null;
      }[]
    >(
      'SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_CATALOG = @p0 AND TABLE_NAME = @p1',
      [this.currentDatabase, table],
    );

    return rows.map((row) => ({
      name: row.COLUMN_NAME,
      type: row.DATA_TYPE,
      isNullable: row.IS_NULLABLE === 'YES',
      defaultValue: row.COLUMN_DEFAULT || undefined,
      maxLength: row.CHARACTER_MAXIMUM_LENGTH || undefined,
    }));
  }

  async getIndexes(table: string): Promise<IndexMetadata[]> {
    const rows = await this.executeQuery<
      {
        IndexName: string;
        ColumnName: string;
        IsUnique: boolean;
        IndexType: string;
      }[]
    >(
      `SELECT 
        i.name AS IndexName,
        c.name AS ColumnName,
        i.is_unique AS IsUnique,
        i.type_desc AS IndexType
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      INNER JOIN sys.tables t ON i.object_id = t.object_id
      WHERE t.name = @p0`,
      [table],
    );

    return rows.map((row) => ({
      name: row.IndexName,
      column: row.ColumnName,
      isUnique: row.IsUnique,
      type: row.IndexType,
      targetColumn: row.ColumnName,
    }));
  }

  async getForeignKeys(table: string): Promise<ForeignKeyMetadata[]> {
    const rows = await this.executeQuery<
      {
        ForeignKeyName: string;
        ColumnName: string;
        ReferencedTable: string;
        ReferencedColumn: string;
      }[]
    >(
      `SELECT 
          f.name AS ForeignKeyName,
          COL_NAME(fc.parent_object_id, fc.parent_column_id) AS ColumnName,
          OBJECT_NAME (f.referenced_object_id) AS ReferencedTable,
          COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS ReferencedColumn
      FROM sys.foreign_keys AS f
      INNER JOIN sys.foreign_key_columns AS fc ON f.object_id = fc.constraint_object_id
      WHERE OBJECT_NAME(f.parent_object_id) = @p0`,
      [table],
    );

    return rows.map((row) => ({
      constraintName: row.ForeignKeyName,
      columnName: row.ColumnName,
      referencedTable: row.ReferencedTable,
      referencedColumn: row.ReferencedColumn,
    }));
  }

  async getConstraints(table: string): Promise<ConstraintMetadata[]> {
    const rows = await this.executeQuery<
      {
        CONSTRAINT_NAME: string;
        CONSTRAINT_TYPE: string;
      }[]
    >(
      `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE 
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
       WHERE TABLE_CATALOG = @p0 AND TABLE_NAME = @p1`,
      [this.currentDatabase, table],
    );

    return rows.map((row) => ({
      name: row.CONSTRAINT_NAME,
      type: row.CONSTRAINT_TYPE,
    }));
  }

  async getDDL(
    name: string,
    type: 'table' | 'view' | 'procedure' | 'trigger' = 'table',
  ): Promise<string> {
    if (!this.pool) {
      throw new Error('Driver not connected');
    }

    if (type === 'table') {
      // Simplified DDL for table as MSSQL doesn't have a simple SHOW CREATE TABLE
      return `-- DDL for table ${name} (Simplified)\n-- Use a specialized tool for full schema generation.`;
    }

    const rows = await this.executeQuery<{ definition: string }[]>(
      `SELECT definition FROM sys.sql_modules WHERE object_id = OBJECT_ID(@p0)`,
      [name],
    );

    if (!rows || rows.length === 0) return '';
    return rows[0].definition;
  }

  async cancelQuery(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}
