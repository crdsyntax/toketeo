import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SqliteService } from '../sqlite.service';

export interface FavoriteEntity {
  id: string;
  name: string;
  query: string;
  createdAt: Date;
}

@Injectable()
export class SqliteFavoritesRepository {
  private readonly logger = new Logger(SqliteFavoritesRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  async save(name: string, query: string): Promise<FavoriteEntity> {
    const db = this.sqlite.getDb();
    const id = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO favorites (id, name, query)
      VALUES (?, ?, ?)
    `);

    stmt.run(id, name, query);
    
    return {
      id,
      name,
      query,
      createdAt: new Date(),
    };
  }

  async findAll(): Promise<FavoriteEntity[]> {
    const rows = this.sqlite.getDb().prepare(`
      SELECT * FROM favorites ORDER BY created_at DESC
    `).all() as any[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      query: row.query,
      createdAt: new Date(row.created_at + 'Z'),
    }));
  }

  async delete(id: string): Promise<void> {
    this.sqlite.getDb().prepare('DELETE FROM favorites WHERE id = ?').run(id);
  }
}
