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

  constructor(
    private readonly config: mysql.ConnectionOptions,
    private readonly sshConfig?: SshConfigDto,
  ) {}

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

  async executeQuery<T>(sql: string, params?: any[]): Promise<T> {
    if (!this.connection) {
      throw new Error('Driver not connected');
    }
    const [rows] = await this.connection.execute(sql, params);
    return rows as T;
  }

  async getTables(): Promise<string[]> {
    const rows = await this.executeQuery<InfoSchemaTable[]>(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [this.config.database],
    );
    return rows.map((row) => row.TABLE_NAME);
  }

  async getColumns(table: string): Promise<InfoSchemaColumn[]> {
    return this.executeQuery<InfoSchemaColumn[]>(
      'SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [this.config.database, table],
    );
  }

  async getDDL(table: string): Promise<string> {
    const rows = await this.executeQuery<any[]>(`SHOW CREATE TABLE \`${table}\``);
    return rows[0]['Create Table'];
  }
}
