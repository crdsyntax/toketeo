import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, Client } from '@libsql/client';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class SqliteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqliteService.name);
  private client: Client;

  async onModuleInit() {
    await this.initDatabase();
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.close();
      this.logger.log('SQLite database closed.');
    }
  }

  private async initDatabase() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'app.db');
    this.client = createClient({
      url: `file:${dbPath}`,
    });

    this.logger.log(`SQLite database initialized at ${dbPath}`);
    await this.createTables();
  }

  private async createTables() {
    await this.client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        environment TEXT DEFAULT 'development',
        type TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        database TEXT NOT NULL,
        user TEXT NOT NULL,
        password TEXT,
        ssh TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS query_history (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        sql TEXT NOT NULL,
        execution_time INTEGER NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        resource_id TEXT,
        metadata TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    this.logger.log('SQLite schema verified.');
  }

  getClient(): Client {
    return this.client;
  }
}
