import { Injectable, Logger } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { AuditRepository } from './audit.repository.interface';
import { AuditEntity } from '../entities/audit.entity';

@Injectable()
export class MariaDbAuditRepository implements AuditRepository {
  private readonly logger = new Logger(MariaDbAuditRepository.name);
  private pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'toketeo',
      waitForConnections: true,
      connectionLimit: 10,
    });
  }

  async create(audit: Partial<AuditEntity>): Promise<void> {
    const sql = `
      INSERT INTO audit_logs (id, userId, action, resource, resourceId, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const id = crypto.randomUUID();
    await this.pool.execute(sql, [
      id,
      audit.userId ?? null,
      audit.action ?? null,
      audit.resource ?? null,
      audit.resourceId ?? null,
      audit.metadata ? JSON.stringify(audit.metadata) : null,
    ]);
  }

  async findAll(limit: number, offset: number): Promise<AuditEntity[]> {
    const sql =
      'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    const [rows] = await this.pool.execute(sql, [limit, offset]);
    return rows as AuditEntity[];
  }

  async findByUser(userId: string): Promise<AuditEntity[]> {
    const sql =
      'SELECT * FROM audit_logs WHERE userId = ? ORDER BY timestamp DESC';
    const [rows] = await this.pool.execute(sql, [userId]);
    return rows as AuditEntity[];
  }
}
