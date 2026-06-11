/* eslint-disable @typescript-eslint/no-unused-vars */
import { Client, ClientConfig } from 'pg';
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

export class PostgresDriver implements DatabaseDriver {
  private client: Client | null = null;
  private tunnel: SshTunnel | null = null;
  private currentSchema: string = 'public';

  constructor(
    private readonly config: ClientConfig,
    private readonly sshConfig?: SshConfigDto,
  ) {
    this.currentSchema = (config.database as string) || 'public';
  }

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
    // If it's a SELECT, return rows as T.
    // If it's a command (UPDATE/DELETE/INSERT), we need to provide rowCount.
    // We'll return an object that matches QueryResultInfo
    if (res.command === 'SELECT') {
      return res.rows as T;
    }
    return {
      rows: res.rows,
      affectedRows: res.rowCount ?? 0,
      fields: res.fields,
    } as unknown as T;
  }

  async getSchemas(): Promise<string[]> {
    const rows = await this.executeQuery<{ schema_name: string }[]>(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog') ORDER BY schema_name",
    );
    return rows.map((row) => row.schema_name);
  }

  setSchema(schema: string): void {
    this.currentSchema = schema;
    if (this.client) {
      void this.client.query(`SET search_path TO "${schema}"`);
    }
  }

  async getTables(): Promise<string[]> {
    const rows = await this.executeQuery<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
      [this.currentSchema],
    );
    return rows.map((row) => row.table_name);
  }

  async getViews(): Promise<string[]> {
    const rows = await this.executeQuery<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'VIEW'",
      [this.currentSchema],
    );
    return rows.map((row) => row.table_name);
  }

  async getProcedures(): Promise<string[]> {
    const rows = await this.executeQuery<{ routine_name: string }[]>(
      "SELECT routine_name FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'PROCEDURE'",
      [this.currentSchema],
    );
    return rows.map((row) => row.routine_name);
  }

  async getTriggers(): Promise<string[]> {
    const rows = await this.executeQuery<{ trigger_name: string }[]>(
      'SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = $1',
      [this.currentSchema],
    );
    return rows.map((row) => row.trigger_name);
  }

  async getColumns(table: string): Promise<ColumnMetadata[]> {
    const rows = await this.executeQuery<
      {
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
        character_maximum_length: number | null;
      }[]
    >(
      'SELECT column_name, data_type, is_nullable, column_default, character_maximum_length FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2',
      [this.currentSchema, table],
    );

    return rows.map((row) => ({
      name: row.column_name,
      type: row.data_type,
      isNullable: row.is_nullable === 'YES',
      defaultValue: row.column_default || undefined,
      maxLength: row.character_maximum_length || undefined,
    }));
  }

  async getIndexes(table: string): Promise<IndexMetadata[]> {
    const rows = await this.executeQuery<
      {
        index_name: string;
        column_name: string;
        is_unique: boolean;
        index_type: string;
      }[]
    >(
      `SELECT
          i.relname as index_name,
          a.attname as column_name,
          ix.indisunique as is_unique,
          am.amname as index_type
      FROM
          pg_class t,
          pg_class i,
          pg_index ix,
          pg_attribute a,
          pg_namespace n,
          pg_am am
      WHERE
          t.oid = ix.indrelid
          AND i.oid = ix.indexrelid
          AND a.attrelid = t.oid
          AND a.attnum = ANY(ix.indkey)
          AND t.relkind = 'r'
          AND n.oid = t.relnamespace
          AND n.nspname = $1
          AND t.relname = $2
          AND i.relam = am.oid
      ORDER BY
          t.relname,
          i.relname;`,
      [this.currentSchema, table],
    );
    return rows.map((row) => ({
      name: row.index_name,
      column: row.column_name,
      isUnique: row.is_unique,
      type: row.index_type,
      targetColumn: row.column_name,
    }));
  }

  async getForeignKeys(table: string): Promise<ForeignKeyMetadata[]> {
    const rows = await this.executeQuery<
      {
        constraint_name: string;
        column_name: string;
        referenced_table_name: string;
        referenced_column_name: string;
      }[]
    >(
      `SELECT
          tc.constraint_name, 
          kcu.column_name, 
          ccu.table_name AS referenced_table_name,
          ccu.column_name AS referenced_column_name 
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2;`,
      [this.currentSchema, table],
    );
    return rows.map((row) => ({
      constraintName: row.constraint_name,
      columnName: row.column_name,
      referencedTable: row.referenced_table_name,
      referencedColumn: row.referenced_column_name,
    }));
  }

  async getConstraints(table: string): Promise<ConstraintMetadata[]> {
    const rows = await this.executeQuery<
      {
        constraint_name: string;
        constraint_type: string;
      }[]
    >(
      `SELECT constraint_name, constraint_type
       FROM information_schema.table_constraints
       WHERE table_schema = $1 AND table_name = $2`,
      [this.currentSchema, table],
    );
    return rows.map((row) => ({
      name: row.constraint_name,
      type: row.constraint_type,
    }));
  }

  async getParameters(
    _: string,
    _1: 'procedure' | 'function' | 'view',
  ): Promise<ParameterMetadata[]> {
    return Promise.resolve([]);
  }

  async getDDL(
    name: string,
    _2: 'table' | 'view' | 'procedure' | 'trigger' = 'table',
  ): Promise<string> {
    return Promise.resolve(
      `-- DDL for ${name} (${_2}) (Postgres support pending)`,
    );
  }
}
