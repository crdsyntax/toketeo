import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditRepository } from '../../../audit/repositories/audit.repository.interface';
import { AuditEntity, AuditAction } from '../../../audit/entities/audit.entity';
import { SqliteService } from '../sqlite.service';

interface AuditLogRow {
  id: string;
  user_id: string;
  action: string;
  resource: string;
  resource_id: string | null;
  metadata: string | null;
  timestamp: string;
}

@Injectable()
export class SqliteAuditRepository implements AuditRepository {
  private readonly logger = new Logger(SqliteAuditRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  async create(audit: Partial<AuditEntity>): Promise<void> {
    const client = this.sqlite.getClient();
    await client.execute({
      sql: `
        INSERT INTO audit_logs (id, user_id, action, resource, resource_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        audit.id || randomUUID(),
        audit.userId || 'system',
        audit.action || '',
        audit.resource || '',
        audit.resourceId || null,
        audit.metadata ? JSON.stringify(audit.metadata) : null,
      ],
    });
  }

  async findAll(limit: number, offset: number): Promise<AuditEntity[]> {
    const rs = await this.sqlite.getClient().execute({
      sql: `
        SELECT * FROM audit_logs 
        ORDER BY timestamp DESC 
        LIMIT ? OFFSET ?
      `,
      args: [limit, offset],
    });

    return rs.rows.map((row) =>
      this.mapToEntity(row as unknown as AuditLogRow),
    );
  }

  async findByUser(userId: string): Promise<AuditEntity[]> {
    const rs = await this.sqlite.getClient().execute({
      sql: `
        SELECT * FROM audit_logs 
        WHERE user_id = ? 
        ORDER BY timestamp DESC
      `,
      args: [userId],
    });

    return rs.rows.map((row) =>
      this.mapToEntity(row as unknown as AuditLogRow),
    );
  }

  private mapToEntity(row: AuditLogRow): AuditEntity {
    const entity = new AuditEntity();
    entity.id = row.id;
    entity.userId = row.user_id;
    entity.action = row.action as AuditAction;
    entity.resource = row.resource;
    entity.resourceId = row.resource_id || undefined;
    entity.metadata = row.metadata
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : undefined;
    entity.timestamp = new Date(row.timestamp + 'Z');
    return entity;
  }
}
