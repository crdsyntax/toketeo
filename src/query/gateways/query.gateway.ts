import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { QueryService } from '../query.service';
import { ExecuteQueryDto } from '../dto/query-execution.dto';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'queries',
})
export class QueryGateway {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('QueryGateway');
  private activeQueries = new Map<string, { abort: () => void }>();

  constructor(private readonly queryService: QueryService) {}

  @SubscribeMessage('execute-query')
  async handleExecuteQuery(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      connectionId: string;
      dto: ExecuteQueryDto;
      tabId: string;
      isSilent?: boolean;
    },
  ) {
    const { connectionId, dto, tabId, isSilent } = data;
    const queryKey = `${client.id}:${tabId}`;

    try {
      // Logic for cancellation (simplified for now as drivers might not support true abort yet)
      let isAborted = false;
      this.activeQueries.set(queryKey, {
        abort: () => {
          isAborted = true;
        },
      });

      await this.queryService.executeStream(
        connectionId,
        dto,
        (result) => {
          if (isAborted) return;
          this.server.to(client.id).emit('query-result', {
            tabId,
            status: 'success',
            ...result,
            isSilent,
          });
        },
        (status) => {
          if (isAborted) return;
          this.server.to(client.id).emit('query-progress', {
            tabId,
            status,
            message: `Query state: ${status}`,
            isSilent,
          });
        },
      );

      if (isAborted) {
        this.server.to(client.id).emit('query-error', {
          tabId,
          status: 'error',
          message: 'Query cancelled by user',
          isSilent,
        });
      }
    } catch (error) {
      this.server.to(client.id).emit('query-error', {
        tabId,
        status: 'error',
        message: (error as Error).message || 'Unknown error',
        isSilent,
      });
    } finally {
      this.activeQueries.delete(queryKey);
    }
  }

  @SubscribeMessage('cancel-query')
  async handleCancelQuery(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tabId: string; connectionId?: string },
  ) {
    const queryKey = `${client.id}:${data.tabId}`;
    const active = this.activeQueries.get(queryKey);
    if (active) {
      active.abort();
      if (data.connectionId) {
        await this.queryService.cancel(data.connectionId);
      }
      this.logger.log(`Query cancelled for tab: ${data.tabId}`);
    }
  }
}
