import { Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';

/**
 * Microservice-side filter. A domain exception thrown inside a
 * `@MessagePattern`/`@EventPattern` handler is turned into a plain,
 * serializable error `{ statusCode, message }` that travels back over RabbitMQ.
 * The gateway's HttpExceptionFilter then maps that status onto the HTTP
 * response — so a NotFoundException here becomes a real 404 there, instead of
 * the old "error object with HTTP 200".
 */
@Catch()
export class RpcExceptionFilter implements ExceptionFilter {
  catch(exception: unknown): Observable<never> {
    let statusCode = 500;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();
      message =
        typeof response === 'string'
          ? response
          : (((response as Record<string, unknown>).message as string) ??
            exception.message);
    } else if (exception instanceof RpcException) {
      const error = exception.getError();
      if (error && typeof error === 'object') {
        statusCode = (error as { statusCode?: number }).statusCode ?? 500;
        message = (error as { message?: string }).message ?? message;
      } else if (typeof error === 'string') {
        message = error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    return throwError(() => ({ statusCode, message }));
  }
}
