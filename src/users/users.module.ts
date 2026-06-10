import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { MariaDbUsersRepository } from './repositories/mariadb-users.repository';

@Module({
  providers: [
    UsersService,
    {
      provide: 'UsersRepository',
      useClass: MariaDbUsersRepository,
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}
