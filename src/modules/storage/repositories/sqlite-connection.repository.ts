import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConnectionRepository } from '../../../connection/repositories/connection.repository.interface';
import { ConnectionEntity } from '../../../connection/entities/connection.entity';
import {
  CreateConnectionDto,
  Environment,
  DatabaseType,
  SshConfigDto,
} from '../../../connection/dto/create-connection.dto';
import { SqliteService } from '../sqlite.service';

interface ConnectionRow {
  id: string;
  name: string;
  environment: string;
  type: string;
  host: string;
  port: number;
  database: string | null;
  user: string;
  password: string | null;
  ssh: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class SqliteConnectionRepository implements ConnectionRepository {
  private readonly logger = new Logger(SqliteConnectionRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  async findAll(): Promise<ConnectionEntity[]> {
    const rs = await this.sqlite
      .getClient()
      .execute('SELECT * FROM connections');
    return rs.rows.map((row) =>
      this.mapToEntity(row as unknown as ConnectionRow),
    );
  }

  async findById(id: string): Promise<ConnectionEntity | null> {
    const rs = await this.sqlite.getClient().execute({
      sql: 'SELECT * FROM connections WHERE id = ?',
      args: [id],
    });
    const row = rs.rows[0];
    return row ? this.mapToEntity(row as unknown as ConnectionRow) : null;
  }

  async save(
    data: CreateConnectionDto | ConnectionEntity,
  ): Promise<ConnectionEntity> {
    const isUpdate = 'id' in data;
    const client = this.sqlite.getClient();

    if (isUpdate) {
      const entity = data;
      entity.updatedAt = new Date();

      await client.execute({
        sql: `
          UPDATE connections 
          SET name = ?, environment = ?, type = ?, host = ?, port = ?, database = ?, user = ?, password = ?, ssh = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        args: [
          entity.name,
          entity.environment,
          entity.type,
          entity.host,
          entity.port,
          entity.database || null,
          entity.user,
          entity.password || null,
          entity.ssh ? JSON.stringify(entity.ssh) : null,
          entity.id,
        ],
      });
      return entity;
    } else {
      const dto = data;
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

      await client.execute({
        sql: `
          INSERT INTO connections (id, name, environment, type, host, port, database, user, password, ssh)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          newEntity.id,
          newEntity.name,
          newEntity.environment,
          newEntity.type,
          newEntity.host,
          newEntity.port,
          newEntity.database || null,
          newEntity.user,
          newEntity.password || null,
          newEntity.ssh ? JSON.stringify(newEntity.ssh) : null,
        ],
      });
      return newEntity;
    }
  }

  async delete(id: string): Promise<void> {
    await this.sqlite.getClient().execute({
      sql: 'DELETE FROM connections WHERE id = ?',
      args: [id],
    });
  }

  private mapToEntity(row: ConnectionRow): ConnectionEntity {
    const entity = new ConnectionEntity();
    entity.id = row.id;
    entity.name = row.name;
    entity.environment = row.environment as Environment;
    entity.type = row.type as DatabaseType;
    entity.host = row.host;
    entity.port = Number(row.port);
    entity.database = row.database || undefined;
    entity.user = row.user;
    entity.password = row.password || undefined;
    entity.ssh = row.ssh ? (JSON.parse(row.ssh) as SshConfigDto) : undefined;
    entity.createdAt = new Date(row.created_at + 'Z');
    entity.updatedAt = new Date(row.updated_at + 'Z');
    return entity;
  }
}
