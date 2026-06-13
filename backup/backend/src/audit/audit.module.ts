import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { SqliteAuditRepository } from '../modules/storage/repositories/sqlite-audit.repository';

@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: 'AuditRepository',
      useClass: SqliteAuditRepository,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
