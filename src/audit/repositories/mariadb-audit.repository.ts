import { Injectable, Logger } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { AuditRepository } from './audit.repository.interface';
import { AuditEntity } from '../entities/audit.entity';
import { withRetry } from '../../common/utils/retry';

@Injectable()
export class MariaDbAuditRepository implements AuditRepository {
  private readonly logger = new Logger(MariaDbAuditRepository.name);

  constructor() {}

  async create(audit: Partial<AuditEntity>): Promise<void> {
    this.logger.log(`Audit Log: ${JSON.stringify(audit)}`);
    // Persistent storage disabled to avoid custom tables
  }

  async findAll(limit: number, offset: number): Promise<AuditEntity[]> {
    this.logger.warn('findAll audit logs requested but persistence is disabled');
    return [];
  }

  async findByUser(userId: string): Promise<AuditEntity[]> {
    return [];
  }
}
