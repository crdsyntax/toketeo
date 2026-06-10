import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConnectionRepository } from '../../../connection/repositories/connection.repository.interface';
import { ConnectionEntity } from '../../../connection/entities/connection.entity';
import { CreateConnectionDto, Environment, DatabaseType } from '../../../connection/dto/create-connection.dto';
import { SqliteService } from '../sqlite.service';

@Injectable()
export class SqliteConnectionRepository implements ConnectionRepository {
  private readonly logger = new Logger(SqliteConnectionRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  async findAll(): Promise<ConnectionEntity[]> {
    const rows = this.sqlite.getDb().prepare('SELECT * FROM connections').all() as any[];
    return rows.map(this.mapToEntity);
  }

  async findById(id: string): Promise<ConnectionEntity | null> {
    const row = this.sqlite.getDb().prepare('SELECT * FROM connections WHERE id = ?').get(id) as any;
    return row ? this.mapToEntity(row) : null;
  }

  async save(
    data: CreateConnectionDto | ConnectionEntity,
  ): Promise<ConnectionEntity> {
    const isUpdate = 'id' in data;
    const db = this.sqlite.getDb();

    if (isUpdate) {
      const entity = data as ConnectionEntity;
      entity.updatedAt = new Date();
      
      const stmt = db.prepare(`
        UPDATE connections 
        SET name = ?, environment = ?, type = ?, host = ?, port = ?, database = ?, user = ?, password = ?, ssh = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(
        entity.name,
        entity.environment,
        entity.type,
        entity.host,
        entity.port,
        entity.database,
        entity.user,
        entity.password || null,
        entity.ssh ? JSON.stringify(entity.ssh) : null,
        entity.id
      );
      return entity;
    } else {
      const dto = data as CreateConnectionDto;
      const newEntity = new ConnectionEntity();
      newEntity.id = randomUUID();
      newEntity.name = dto.name;
      newEntity.environment = dto.environment || Environment.DEVELOPMENT;
      newEntity.type = dto.type || DatabaseType.MARIADB;
      newEntity.host = dto.host;
      newEntity.port = dto.port;
      newEntity.database = dto.database;
      newEntity.user = dto.user;
      newEntity.password = dto.password;
      newEntity.ssh = dto.ssh;
      newEntity.createdAt = new Date();
      newEntity.updatedAt = new Date();

      const stmt = db.prepare(`
        INSERT INTO connections (id, name, environment, type, host, port, database, user, password, ssh)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        newEntity.id,
        newEntity.name,
        newEntity.environment,
        newEntity.type,
        newEntity.host,
        newEntity.port,
        newEntity.database,
        newEntity.user,
        newEntity.password || null,
        newEntity.ssh ? JSON.stringify(newEntity.ssh) : null
      );
      return newEntity;
    }
  }

  async delete(id: string): Promise<void> {
    this.sqlite.getDb().prepare('DELETE FROM connections WHERE id = ?').run(id);
  }

  private mapToEntity(row: any): ConnectionEntity {
    const entity = new ConnectionEntity();
    entity.id = row.id;
    entity.name = row.name;
    entity.environment = row.environment as Environment;
    entity.type = row.type as DatabaseType;
    entity.host = row.host;
    entity.port = row.port;
    entity.database = row.database;
    entity.user = row.user;
    entity.password = row.password || undefined;
    entity.ssh = row.ssh ? JSON.parse(row.ssh) : undefined;
    entity.createdAt = new Date(row.created_at + 'Z'); // SQLite CURRENT_TIMESTAMP is UTC
    entity.updatedAt = new Date(row.updated_at + 'Z');
    return entity;
  }
}
