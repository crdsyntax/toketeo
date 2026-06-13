import { Module } from '@nestjs/common';
import { QueryService } from './query.service';
import { QueryController } from './query.controller';
import { ConnectionModule } from '../connection/connection.module';
import { SqliteQueryHistoryRepository } from '../modules/storage/repositories/sqlite-query-history.repository';
import { QueryGateway } from './gateways/query.gateway';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [ConnectionModule, AuditModule],
  controllers: [QueryController],
  providers: [
    QueryService,
    QueryGateway,
    {
      provide: 'QueryHistoryRepository',
      useClass: SqliteQueryHistoryRepository,
    },
  ],
  exports: [QueryService],
})
export class QueryModule {}
