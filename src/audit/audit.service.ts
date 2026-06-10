import { Injectable, Inject } from '@nestjs/common';
import type { AuditRepository } from './repositories/audit.repository.interface';
import { AuditEntity, AuditAction } from './entities/audit.entity';

@Injectable()
export class AuditService {
  constructor(
    @Inject('AuditRepository')
    private readonly repository: AuditRepository,
  ) {}

  async log(
    userId: string,
    action: AuditAction,
    resource: string,
    resourceId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.repository.create({
      userId,
      action,
      resource,
      resourceId,
      metadata,
    });
  }

  async getLogs(limit = 10, offset = 0): Promise<AuditEntity[]> {
    return this.repository.findAll(limit, offset);
  }
}
