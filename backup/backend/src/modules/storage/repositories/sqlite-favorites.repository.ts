import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SqliteService } from '../sqlite.service';

export interface FavoriteEntity {
  id: string;
  name: string;
  query: string;
  createdAt: Date;
}

interface FavoriteRow {
  id: string;
  name: string;
  query: string;
  created_at: string;
}

@Injectable()
export class SqliteFavoritesRepository {
  private readonly logger = new Logger(SqliteFavoritesRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  async save(name: string, query: string): Promise<FavoriteEntity> {
    const client = this.sqlite.getClient();
    const id = randomUUID();
    await client.execute({
      sql: `
        INSERT INTO favorites (id, name, query)
        VALUES (?, ?, ?)
      `,
      args: [id, name, query],
    });

    return {
      id,
      name,
      query,
      createdAt: new Date(),
    };
  }

  async findAll(): Promise<FavoriteEntity[]> {
    const rs = await this.sqlite.getClient().execute(`
      SELECT * FROM favorites ORDER BY created_at DESC
    `);

    return rs.rows.map((row) => {
      const r = row as unknown as FavoriteRow;
      return {
        id: r.id,
        name: r.name,
        query: r.query,
        createdAt: new Date(r.created_at + 'Z'),
      };
    });
  }

  async delete(id: string): Promise<void> {
    await this.sqlite.getClient().execute({
      sql: 'DELETE FROM favorites WHERE id = ?',
      args: [id],
    });
  }
}
