import { Injectable, Logger } from '@nestjs/common';
import { SqliteService } from '../sqlite.service';

@Injectable()
export class SqliteSettingsRepository {
  private readonly logger = new Logger(SqliteSettingsRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  async set(key: string, value: string): Promise<void> {
    const client = this.sqlite.getClient();
    await client.execute({
      sql: `
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      args: [key, value]
    });
  }

  async get(key: string): Promise<string | null> {
    const rs = await this.sqlite.getClient().execute({
      sql: `SELECT value FROM settings WHERE key = ?`,
      args: [key]
    });
    const row = rs.rows[0];
    return row ? row.value as string : null;
  }

  async delete(key: string): Promise<void> {
    await this.sqlite.getClient().execute({
      sql: 'DELETE FROM settings WHERE key = ?',
      args: [key]
    });
  }
}
