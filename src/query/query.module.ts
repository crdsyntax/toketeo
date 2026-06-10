import { Module } from '@nestjs/common';
import { QueryService } from './query.service';
import { QueryController } from './query.controller';
import { ConnectionModule } from '../connection/connection.module';
import { MariaDbQueryHistoryRepository } from './repositories/mariadb-query-history.repository';

@Module({
  imports: [ConnectionModule],
  controllers: [QueryController],
  providers: [
    QueryService,
    {
      provide: 'QueryHistoryRepository',
      useClass: MariaDbQueryHistoryRepository,
    },
  ],
})
export class QueryModule {}
