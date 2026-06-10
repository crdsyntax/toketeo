import { Module } from '@nestjs/common';
import { ConnectionService } from './connection.service';
import { ConnectionController } from './connection.controller';
import { MariaDbConnectionRepository } from './repositories/mariadb-connection.repository';

@Module({
  controllers: [ConnectionController],
  providers: [
    ConnectionService,
    {
      provide: 'ConnectionRepository',
      useClass: MariaDbConnectionRepository,
    },
  ],
  exports: [ConnectionService],
})
export class ConnectionModule {}
