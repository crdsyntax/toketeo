import { Module, Global } from '@nestjs/common';
import { LogsGateway } from './gateways/logs.gateway';
import { GlobalLoggerService } from './services/global-logger.service';

@Global()
@Module({
  providers: [LogsGateway, GlobalLoggerService],
  exports: [LogsGateway, GlobalLoggerService],
})
export class LogsModule {}
