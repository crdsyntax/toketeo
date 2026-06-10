import * as mysql from 'mysql2/promise';
import { DatabaseDriver } from '../interfaces/database-driver.interface';
import { SshConfigDto } from '../dto/create-connection.dto';
import { SshTunnel } from '../utils/ssh-tunnel';

export interface InfoSchemaTable {
  TABLE_NAME: string;
}

export interface InfoSchemaColumn {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
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
    const [rows] = await this.connection.execute(sql, params as any);
    return rows as T;
  }

  async getTables(): Promise<string[]> {
    const rows = await this.executeQuery<InfoSchemaTable[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
      [this.currentDatabase],
    );
    return rows.map((row) => row.TABLE_NAME);
  }

  async getSchemas(): Promise<string[]> {
    const rows = await this.executeQuery<{ Database: string }[]>(
      'SHOW DATABASES',
    );
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
  ): Promise<any[]> {
    if (type === 'view') return []; // Views don't have parameters in standard SQL

    const rows = await this.executeQuery<any[]>(
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

  async getColumns(table: string): Promise<InfoSchemaColumn[]> {
    return this.executeQuery<InfoSchemaColumn[]>(
      'SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [this.currentDatabase, table],
    );
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

    const rows = await this.executeQuery<any[]>(sql);
    if (!rows || rows.length === 0) return '';
    
    return rows[0][key] || JSON.stringify(rows[0], null, 2);
  }

  async cancelQuery(): Promise<void> {
    if (this.connection) {
      // mysql2/promise connection.destroy() is synchronous and immediately closes the socket,
      // which is the most reliable way to stop a long-running query without KILL command.
      this.connection.destroy();
      this.connection = null;
    }
    return Promise.resolve();
  }
}
