import { Client, ClientConfig } from 'pg';
import { DatabaseDriver } from '../interfaces/database-driver.interface';
import { SshConfigDto } from '../dto/create-connection.dto';
import { SshTunnel } from '../utils/ssh-tunnel';

export class PostgresDriver implements DatabaseDriver {
  private client: Client | null = null;
  private tunnel: SshTunnel | null = null;

  constructor(
    private readonly config: ClientConfig,
    private readonly sshConfig?: SshConfigDto,
  ) {}

  async connect(): Promise<void> {
    let connectionConfig = { ...this.config };

    if (this.sshConfig) {
      this.tunnel = new SshTunnel();
      const { host, port } = await this.tunnel.create(
        this.sshConfig,
        (this.config.host as string) || 'localhost',
        (this.config.port as number) || 5432,
      );
      connectionConfig = {
        ...connectionConfig,
        host,
        port,
      };
    }

    this.client = new Client(connectionConfig);
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
    if (this.tunnel) {
      this.tunnel.close();
      this.tunnel = null;
    }
  }

  async executeQuery<T>(sql: string, params?: any[]): Promise<T> {
    if (!this.client) {
      throw new Error('Driver not connected');
    }
    const result = await this.client.query(sql, params);
    return result.rows as T;
  }

  async getTables(): Promise<string[]> {
    const rows = await this.executeQuery<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    return rows.map((row) => row.table_name);
  }

  async getColumns(table: string): Promise<any[]> {
    return this.executeQuery<any[]>(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      [table],
    );
  }

  async getDDL(table: string): Promise<string> {
    // Basic placeholder for Postgres DDL
    return `-- DDL for ${table} (Postgres support pending)`;
  }
}
