import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { Observable, catchError, tap, throwError } from 'rxjs';

/**
 * Acknowledge a RabbitMQ message **after** the handler runs, not before — so a
 * handler that crashes mid-processing leaves the message unacked and it gets
 * redelivered, instead of being lost by a top-of-handler ack.
 *
 * The right ack on error differs by pattern (told apart by `replyTo`, which the
 * request/response transport sets and fire-and-forget events do not):
 *  - **RPC (`@MessagePattern`)**: ack on success *and* on error — the reply
 *    already carries the outcome back to the caller; requeuing would reprocess
 *    a request that was already answered.
 *  - **Event (`@EventPattern`)**: ack on success; on error `nack(requeue=false)`
 *    so the message dead-letters (into the retry/DLQ topology) instead of being
 *    dropped or spun in a hot requeue loop.
 */
@Injectable()
export class RmqReliabilityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'rpc') {
      return next.handle();
    }

    const rmqContext = context.switchToRpc().getContext<RmqContext>();
    const channel = rmqContext.getChannelRef();
    const message = rmqContext.getMessage();
    const isRpc = Boolean(message?.properties?.replyTo);

    return next.handle().pipe(
      tap(() => channel.ack(message)),
      catchError((err) => {
        if (isRpc) {
          channel.ack(message);
        } else {
          channel.nack(message, false, false);
        }
        return throwError(() => err);
      }),
    );
  }
}
