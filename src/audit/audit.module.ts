import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { MariaDbAuditRepository } from './repositories/mariadb-audit.repository';

@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: 'AuditRepository',
      useClass: MariaDbAuditRepository,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
