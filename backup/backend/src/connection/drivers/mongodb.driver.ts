/* eslint-disable @typescript-eslint/no-unused-vars */
import { MongoClient, Db, Document } from 'mongodb';
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

export class MongoDbDriver implements DatabaseDriver {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private tunnel: SshTunnel | null = null;

  constructor(
    private readonly uri: string,
    private readonly databaseName: string,
    private readonly sshConfig?: SshConfigDto,
  ) {}

  async connect(): Promise<void> {
    let finalUri = this.uri;

    if (this.sshConfig) {
      this.tunnel = new SshTunnel();
      const url = new URL(this.uri);
      const { host, port } = await this.tunnel.create(
        this.sshConfig,
        url.hostname,
        parseInt(url.port) || 27017,
      );

      url.hostname = host;
      url.port = port.toString();
      finalUri = url.toString();
    }

    this.client = new MongoClient(finalUri);
    await this.client.connect();
    this.db = this.client.db(this.databaseName);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.tunnel) {
      this.tunnel.close();
      this.tunnel = null;
    }
  }

  async getSchemas(): Promise<string[]> {
    if (!this.client) {
      throw new Error('Driver not connected');
    }
    const adminDb = this.client.db().admin();
    const result = await adminDb.listDatabases();
    return result.databases.map((db) => db.name);
  }

  setSchema(schema: string): void {
    if (this.client) {
      this.db = this.client.db(schema);
    }
  }

  async executeQuery<T>(command: string, params?: unknown[]): Promise<T> {
    if (!this.db) {
      throw new Error('Driver not connected');
    }

    try {
      const cmdObj = JSON.parse(command) as Document;
      const result = await this.db.command(cmdObj);
      return result as unknown as T;
    } catch {
      const collection = this.db.collection(command);
      const filter = (params?.[0] as Document) || {};
      const result = await collection.find(filter).toArray();
      return result as unknown as T;
    }
  }

  async getTables(): Promise<string[]> {
    if (!this.db) {
      throw new Error('Driver not connected');
    }
    const collections = await this.db.listCollections().toArray();
    return collections.map((col) => col.name);
  }

  async getColumns(collectionName: string): Promise<ColumnMetadata[]> {
    if (!this.db) {
      throw new Error('Driver not connected');
    }
    const collection = this.db.collection(collectionName);
    const doc = await collection.findOne();
    if (!doc) return [];

    return Object.keys(doc).map((key) => ({
      name: key,
      type: typeof doc[key],
      isNullable: true,
    }));
  }

  async getIndexes(_: string): Promise<IndexMetadata[]> {
    return Promise.resolve([]);
  }

  async getForeignKeys(_: string): Promise<ForeignKeyMetadata[]> {
    return Promise.resolve([]);
  }

  async getConstraints(_: string): Promise<ConstraintMetadata[]> {
    return Promise.resolve([]);
  }

  async getParameters(
    _1: string,
    _2: 'procedure' | 'function' | 'view',
  ): Promise<ParameterMetadata[]> {
    return Promise.resolve([]);
  }

  async getDDL(
    name: string,
    _: 'table' | 'view' | 'procedure' | 'trigger' = 'table',
  ): Promise<string> {
    if (!this.db) {
      throw new Error('Driver not connected');
    }
    const collections = await this.db.listCollections({ name }).toArray();
    return JSON.stringify(collections[0] || {}, null, 2);
  }

  async cancelQuery(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}
