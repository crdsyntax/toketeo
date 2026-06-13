import { Injectable, ConsoleLogger, LoggerService } from '@nestjs/common';
import { LogsGateway } from '../gateways/logs.gateway';

@Injectable()
export class GlobalLoggerService
  extends ConsoleLogger
  implements LoggerService
{
  constructor(private readonly logsGateway: LogsGateway) {
    super();
    this.setupProcessHandlers();
  }

  private setupProcessHandlers() {
    process.on('uncaughtException', (error) => {
      this.error(
        `Uncaught Exception: ${error.message}`,
        error.stack,
        'Process',
      );
    });

    process.on('unhandledRejection', (reason: unknown) => {
      const error = reason as Error;
      this.error(
        `Unhandled Rejection: ${error?.message || String(reason)}`,
        error?.stack,
        'Process',
      );
    });
  }

  log(message: string, context?: string) {
    super.log(message, context);
    this.broadcast('log', message, context);
  }

  error(message: string, stack?: string, context?: string) {
    super.error(message, stack, context);
    this.broadcast('error', message, context, stack);
  }

  warn(message: string, context?: string) {
    super.warn(message, context);
    this.broadcast('warn', message, context);
  }

  debug(message: string, context?: string) {
    super.debug(message, context);
    this.broadcast('debug', message, context);
  }

  verbose(message: string, context?: string) {
    super.verbose(message, context);
    this.broadcast('verbose', message, context);
  }

  private broadcast(
    level: string,
    message: string,
    context?: string,
    stack?: string,
  ) {
    this.logsGateway.broadcastLog({
      level,
      message,
      context,
      stack,
      timestamp: new Date().toISOString(),
    });
  }
}
