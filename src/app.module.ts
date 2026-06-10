import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConnectionModule } from './connection/connection.module';
import { SchemaModule } from './schema/schema.module';
import { QueryModule } from './query/query.module';
import { ExplorerModule } from './explorer/explorer.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { ExportModule } from './export/export.module';
import { LogsModule } from './logs/logs.module';

@Module({
  imports: [
    ConnectionModule,
    SchemaModule,
    QueryModule,
    ExplorerModule,
    UsersModule,
    AuthModule,
    AuditModule,
    ExportModule,
    LogsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
