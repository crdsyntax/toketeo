import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { SystemService } from '../services/system.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'system',
})
export class SystemGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(SystemGateway.name);

  constructor(private readonly systemService: SystemService) {}

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`System client connected: ${client.id}`);
    const status = await this.systemService.getMysqlStatus();

    if (!status.available) {
      client.emit('system:mysql-unavailable', {
        message:
          'No MySQL service was detected on this machine. Install MySQL or MariaDB to use local connections.',
        checkedPorts: status.checkedPorts,
      });
    }
  }
}
