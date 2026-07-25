import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Gateway-side catch-all. Produces one coherent JSON error shape for every
 * failure and, crucially, restores the correct HTTP status code:
 *  - a real HttpException (e.g. from ValidationPipe) keeps its status;
 *  - an error propagated from a microservice arrives as `{ statusCode, message }`
 *    (see RpcExceptionFilter) and its statusCode becomes the HTTP status.
 * This is what ends the "409/404/401 returned as 200" behaviour.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : (((body as Record<string, unknown>).message as string) ??
            exception.message);
    } else if (
      exception &&
      typeof exception === 'object' &&
      'statusCode' in exception
    ) {
      const rpc = exception as { statusCode?: number; message?: string };
      status =
        typeof rpc.statusCode === 'number'
          ? rpc.statusCode
          : HttpStatus.INTERNAL_SERVER_ERROR;
      message = rpc.message ?? message;
    }

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} -> ${status}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
    });
  }
}
