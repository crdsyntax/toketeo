import { Module } from '@nestjs/common';
import { SystemGateway } from './gateways/system.gateway';
import { SystemService } from './services/system.service';

@Module({
  providers: [SystemGateway, SystemService],
})
export class SystemModule {}
