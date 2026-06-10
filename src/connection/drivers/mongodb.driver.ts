import { MongoClient, Db } from 'mongodb';
import { DatabaseDriver } from '../interfaces/database-driver.interface';
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
      // Extract host and port from URI for tunnel
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
    const { databases } = await adminDb.listDatabases();
    return databases.map((db: any) => db.name);
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

    // In MongoDB context, we expect command to be a JSON string representing a command
    // or a specialized syntax for our application.
    // For now, let's assume it's a JSON command for db.command()
    try {
      const cmdObj = JSON.parse(command);
      const result = await this.db.command(cmdObj);
      return result as T;
    } catch (e) {
      // If it's not JSON, it might be a collection name for find
      const collection = this.db.collection(command);
      const result = await collection.find(params?.[0] || {}).toArray();
      return result as T;
    }
  }

  async getTables(): Promise<string[]> {
    if (!this.db) {
      throw new Error('Driver not connected');
    }
    const collections = await this.db.listCollections().toArray();
    return collections.map((col) => col.name);
  }

  async getColumns(collectionName: string): Promise<unknown[]> {
    if (!this.db) {
      throw new Error('Driver not connected');
    }
    // MongoDB is schema-less, but we can infer schema from the first document
    const collection = this.db.collection(collectionName);
    const doc = await collection.findOne();
    if (!doc) return [];

    return Object.keys(doc).map((key) => ({
      COLUMN_NAME: key,
      DATA_TYPE: typeof doc[key],
      IS_NULLABLE: 'YES',
    }));
  }

  async getParameters(
    _name: string,
    _type: 'procedure' | 'function' | 'view',
  ): Promise<any[]> {
    return [];
  }

  async getDDL(
    name: string,
    _type: 'table' | 'view' | 'procedure' | 'trigger' = 'table',
  ): Promise<string> {
    if (!this.db) {
      throw new Error('Driver not connected');
    }
    const collections = await this.db.listCollections({ name }).toArray();
    return JSON.stringify(collections[0] || {}, null, 2);
  }

  async cancelQuery(): Promise<void> {
    // MongoDB driver handles cancellation via AbortSignal or closing client
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}
