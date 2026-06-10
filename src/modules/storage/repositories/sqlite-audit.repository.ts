import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditRepository } from '../../../audit/repositories/audit.repository.interface';
import { AuditEntity, AuditAction } from '../../../audit/entities/audit.entity';
import { SqliteService } from '../sqlite.service';

@Injectable()
export class SqliteAuditRepository implements AuditRepository {
  private readonly logger = new Logger(SqliteAuditRepository.name);

  constructor(private readonly sqlite: SqliteService) {}

  async create(audit: Partial<AuditEntity>): Promise<void> {
    const db = this.sqlite.getDb();
    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, resource, resource_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      audit.id || randomUUID(),
      audit.userId || 'system',
      audit.action,
      audit.resource,
      audit.resourceId || null,
      audit.metadata ? JSON.stringify(audit.metadata) : null,
    );
  }

  async findAll(limit: number, offset: number): Promise<AuditEntity[]> {
    const rows = this.sqlite.getDb().prepare(`
      SELECT * FROM audit_logs 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    return rows.map(this.mapToEntity);
  }

  async findByUser(userId: string): Promise<AuditEntity[]> {
    const rows = this.sqlite.getDb().prepare(`
      SELECT * FROM audit_logs 
      WHERE user_id = ? 
      ORDER BY timestamp DESC
    `).all(userId) as any[];

    return rows.map(this.mapToEntity);
  }

  private mapToEntity(row: any): AuditEntity {
    const entity = new AuditEntity();
    entity.id = row.id;
    entity.userId = row.user_id;
    entity.action = row.action as AuditAction;
    entity.resource = row.resource;
    entity.resourceId = row.resource_id || undefined;
    entity.metadata = row.metadata ? JSON.parse(row.metadata) : undefined;
    entity.timestamp = new Date(row.timestamp + 'Z');
    return entity;
  }
}
