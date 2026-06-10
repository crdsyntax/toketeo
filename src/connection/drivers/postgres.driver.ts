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

  async executeQuery<T>(sql: string, params?: unknown[]): Promise<T> {
    if (!this.client) {
      throw new Error('Driver not connected');
    }
    const res = await this.client.query(sql, params);
    return res.rows as T;
  }

  async getTables(): Promise<string[]> {
    const rows = await this.executeQuery<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    return rows.map((row) => row.table_name);
  }

  async getViews(): Promise<string[]> {
    const rows = await this.executeQuery<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'VIEW'",
    );
    return rows.map((row) => row.table_name);
  }

  async getProcedures(): Promise<string[]> {
    const rows = await this.executeQuery<{ routine_name: string }[]>(
      "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'PROCEDURE'",
    );
    return rows.map((row) => row.routine_name);
  }

  async getTriggers(): Promise<string[]> {
    const rows = await this.executeQuery<{ trigger_name: string }[]>(
      "SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = 'public'",
    );
    return rows.map((row) => row.trigger_name);
  }

  async getColumns(
    table: string,
  ): Promise<
    { column_name: string; data_type: string; is_nullable: string }[]
  > {
    return this.executeQuery<
      { column_name: string; data_type: string; is_nullable: string }[]
    >(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      [table],
    );
  }

  async getParameters(
    _name: string,
    _type: 'procedure' | 'function' | 'view',
  ): Promise<any[]> {
    return []; // Postgres implementation pending
  }

  async getDDL(
    name: string,
    type: 'table' | 'view' | 'procedure' | 'trigger' = 'table',
  ): Promise<string> {
    // Basic placeholder for Postgres DDL
    return Promise.resolve(`-- DDL for ${name} (${type}) (Postgres support pending)`);
  }
}
