import * as mysql from 'mysql2/promise';
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

export interface InfoSchemaTable {
  TABLE_NAME: string;
}

export interface InfoSchemaColumn {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_DEFAULT: string | null;
  CHARACTER_MAXIMUM_LENGTH: number | null;
}

export class MariaDbDriver implements DatabaseDriver {
  private connection: mysql.Connection | null = null;
  private tunnel: SshTunnel | null = null;
  private currentDatabase: string;

  constructor(
    private readonly config: mysql.ConnectionOptions,
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
        this.config.host || 'localhost',
        this.config.port || 3306,
      );
      connectionConfig = {
        ...connectionConfig,
        host,
        port,
      };
    }

    this.connection = await mysql.createConnection(connectionConfig);
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
    if (this.tunnel) {
      this.tunnel.close();
      this.tunnel = null;
    }
  }

  async executeQuery<T>(sql: string, params?: unknown[]): Promise<T> {
    if (!this.connection) {
      throw new Error('Driver not connected');
    }
    const [rows] = await this.connection.execute(
      sql,
      params as mysql.RowDataPacket[],
    );
    return rows as T;
  }

  async *executeQueryStream(
    sql: string,
    params?: unknown[],
  ): AsyncIterableIterator<Record<string, unknown>> {
    if (!this.connection) {
      throw new Error('Driver not connected');
    }

    // Accessing the underlying non-promise connection to use .stream()
    // Using a more constrained type than any for the underlying driver interface.
    const stream = (
      this.connection as mysql.Connection & {
        connection: {
          query: (
            sql: string,
            params?: unknown[],
          ) => {
            stream: (opts: {
              objectMode: boolean;
            }) => AsyncIterable<Record<string, unknown>>;
          };
        };
      }
    ).connection
      .query(sql, params)
      .stream({ objectMode: true });

    for await (const row of stream) {
      yield row;
    }
  }

  async getTables(): Promise<string[]> {
    const rows = await this.executeQuery<InfoSchemaTable[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
      [this.currentDatabase],
    );
    return rows.map((row) => row.TABLE_NAME);
  }

  async getSchemas(): Promise<string[]> {
    const rows =
      await this.executeQuery<{ Database: string }[]>('SHOW DATABASES');
    return rows.map((row) => row.Database);
  }

  setSchema(schema: string): void {
    this.currentDatabase = schema;
    if (this.connection) {
      void this.connection.query(`USE \`${schema}\``);
    }
  }

  async getViews(): Promise<string[]> {
    const rows = await this.executeQuery<InfoSchemaTable[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW'",
      [this.currentDatabase],
    );
    return rows.map((row) => row.TABLE_NAME);
  }

  async getProcedures(): Promise<string[]> {
    const rows = await this.executeQuery<{ ROUTINE_NAME: string }[]>(
      "SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'",
      [this.currentDatabase],
    );
    return rows.map((row) => row.ROUTINE_NAME);
  }

  async getTriggers(): Promise<string[]> {
    const rows = await this.executeQuery<{ TRIGGER_NAME: string }[]>(
      'SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?',
      [this.currentDatabase],
    );
    return rows.map((row) => row.TRIGGER_NAME);
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
        PARAMETER_MODE: 'IN' | 'OUT' | 'INOUT';
      }[]
    >(
      `SELECT PARAMETER_NAME, DATA_TYPE, PARAMETER_MODE 
       FROM information_schema.PARAMETERS 
       WHERE SPECIFIC_SCHEMA = ? AND SPECIFIC_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [this.currentDatabase, name],
    );

    return rows.map((row) => ({
      name: row.PARAMETER_NAME,
      type: row.DATA_TYPE,
      mode: row.PARAMETER_MODE,
    }));
  }

  async getColumns(table: string): Promise<ColumnMetadata[]> {
    const rows = await this.executeQuery<InfoSchemaColumn[]>(
      'SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
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
        INDEX_NAME: string;
        COLUMN_NAME: string;
        NON_UNIQUE: number;
        INDEX_TYPE: string;
      }[]
    >(
      'SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY SEQ_IN_INDEX',
      [this.currentDatabase, table],
    );

    return rows.map((row) => ({
      name: row.INDEX_NAME,
      column: row.COLUMN_NAME,
      isUnique: row.NON_UNIQUE === 0,
      type: row.INDEX_TYPE,
      targetColumn: row.COLUMN_NAME,
    }));
  }

  async getForeignKeys(table: string): Promise<ForeignKeyMetadata[]> {
    const rows = await this.executeQuery<
      {
        CONSTRAINT_NAME: string;
        COLUMN_NAME: string;
        REFERENCED_TABLE_NAME: string;
        REFERENCED_COLUMN_NAME: string;
      }[]
    >(
      `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME 
       FROM information_schema.KEY_COLUMN_USAGE 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [this.currentDatabase, table],
    );

    return rows.map((row) => ({
      constraintName: row.CONSTRAINT_NAME,
      columnName: row.COLUMN_NAME,
      referencedTable: row.REFERENCED_TABLE_NAME,
      referencedColumn: row.REFERENCED_COLUMN_NAME,
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
       FROM information_schema.TABLE_CONSTRAINTS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
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
    if (!this.connection) {
      throw new Error('Driver not connected');
    }

    let sql = '';
    let key = '';

    switch (type) {
      case 'view':
        sql = `SHOW CREATE VIEW \`${name}\``;
        key = 'Create View';
        break;
      case 'procedure':
        sql = `SHOW CREATE PROCEDURE \`${name}\``;
        key = 'Create Procedure';
        break;
      case 'trigger':
        sql = `SHOW CREATE TRIGGER \`${name}\``;
        key = 'SQL Original Statement';
        break;
      default:
        sql = `SHOW CREATE TABLE \`${name}\``;
        key = 'Create Table';
    }

    const rows = await this.executeQuery<Record<string, string>[]>(sql);
    if (!rows || rows.length === 0) return '';

    return rows[0][key] || JSON.stringify(rows[0], null, 2);
  }

  async cancelQuery(): Promise<void> {
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
    return Promise.resolve();
  }
}
