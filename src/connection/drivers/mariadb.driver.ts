import * as mysql from 'mysql2/promise';
import { DatabaseDriver } from '../interfaces/database-driver.interface';

export class MariaDbDriver implements DatabaseDriver {
  private connection: mysql.Connection | null = null;

  constructor(private readonly config: mysql.ConnectionOptions) {}

  async connect(): Promise<void> {
    this.connection = await mysql.createConnection(this.config);
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
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
    const rows = await this.executeQuery<any[]>(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [this.config.database],
    );
    return rows.map((row) => row.TABLE_NAME);
  }

  async getColumns(table: string): Promise<any[]> {
    return this.executeQuery<any[]>(
      'SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [this.config.database, table],
    );
  }
}
