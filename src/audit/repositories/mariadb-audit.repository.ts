import { Injectable, Logger } from '@nestjs/common';
import { AuditRepository } from './audit.repository.interface';
import { AuditEntity } from '../entities/audit.entity';

@Injectable()
export class MariaDbAuditRepository implements AuditRepository {
  private readonly logger = new Logger(MariaDbAuditRepository.name);

  constructor() {}

  async create(audit: Partial<AuditEntity>): Promise<void> {
    this.logger.log(`Audit Log: ${JSON.stringify(audit)}`);
    await Promise.resolve();
  }

  async findAll(limit: number, offset: number): Promise<AuditEntity[]> {
    this.logger.warn(
      `findAll audit logs requested (limit: ${limit}, offset: ${offset}) but persistence is disabled`,
    );
    return Promise.resolve([]);
  }

  async findByUser(userId: string): Promise<AuditEntity[]> {
    this.logger.log(`findByUser audit logs requested for ${userId}`);
    return Promise.resolve([]);
  }
}
