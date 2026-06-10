import { Module } from '@nestjs/common';
import { ConnectionService } from './connection.service';
import { ConnectionController } from './connection.controller';
import { SqliteConnectionRepository } from '../modules/storage/repositories/sqlite-connection.repository';

@Module({
  controllers: [ConnectionController],
  providers: [
    ConnectionService,
    {
      provide: 'ConnectionRepository',
      useClass: SqliteConnectionRepository,
    },
  ],
  exports: [ConnectionService],
})
export class ConnectionModule {}
