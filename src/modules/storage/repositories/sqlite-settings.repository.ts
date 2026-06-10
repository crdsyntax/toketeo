import { Injectable, Logger } from '@nestjs/common';
import { SqliteService } from '../sqlite.service';

@Injectable()
export class SqliteSettingsRepository {
  private readonly logger = new Logger(SqliteSettingsRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  async set(key: string, value: string): Promise<void> {
    const db = this.sqlite.getDb();
    const stmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }

  async get(key: string): Promise<string | null> {
    const row = this.sqlite.getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as any;
    return row ? row.value : null;
  }

  async delete(key: string): Promise<void> {
    this.sqlite.getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
}
