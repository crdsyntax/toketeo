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

  async findAll(): Promise<AuditEntity[]> {
    this.logger.warn(
      'findAll audit logs requested but persistence is disabled',
    );
    return Promise.resolve([]);
  }

  async findByUser(): Promise<AuditEntity[]> {
    return Promise.resolve([]);
  }
}
