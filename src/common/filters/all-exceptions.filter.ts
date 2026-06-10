import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { GlobalLoggerService } from '../../logs/services/global-logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: GlobalLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: (exception as Error).message || 'Internal server error' };

    this.logger.error(
      `HTTP ${status} ${request.method} ${request.url}`,
      (exception as Error).stack,
      'AllExceptionsFilter',
    );

    response.status(status).json(message);
  }
}
