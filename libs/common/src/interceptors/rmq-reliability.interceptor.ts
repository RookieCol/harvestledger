import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { RETRY_COUNT_HEADER } from '../rmq/retry-topology';

export interface RmqReliabilityOptions {
  /** How many times an event is retried (via the backoff queue) before it is
   * parked in the dead-letter queue. */
  maxRetries?: number;
  /** Backoff/retry queue for failed events. Unset (RPC-only services) → the
   * retry branch is never reached. */
  retryQueue?: string;
  /** Final dead-letter queue for exhausted events. */
  deadLetterQueue?: string;
}

/**
 * Acknowledge a RabbitMQ message **after** the handler runs, not before — so a
 * handler that crashes mid-processing leaves the message unacked and it gets
 * redelivered, instead of being lost by a top-of-handler ack.
 *
 * Ack semantics differ by pattern (told apart by `replyTo`, which the
 * request/response transport sets and fire-and-forget events do not):
 *  - **RPC (`@MessagePattern`)**: ack on success *and* on error — the reply
 *    already carries the outcome back to the caller.
 *  - **Event (`@EventPattern`)**: ack on success. On error, republish to the
 *    retry queue (a TTL delay that routes the message back) with an incremented
 *    retry counter; after `maxRetries` it is republished to the DLQ instead. The
 *    original is always acked, since a copy has been re-routed.
 */
@Injectable()
export class RmqReliabilityInterceptor implements NestInterceptor {
  private readonly maxRetries: number;
  private readonly retryQueue?: string;
  private readonly deadLetterQueue?: string;

  constructor(options: RmqReliabilityOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.retryQueue = options.retryQueue;
    this.deadLetterQueue = options.deadLetterQueue;
  }

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
          this.handleEventFailure(channel, message);
        }
        return throwError(() => err);
      }),
    );
  }

  private handleEventFailure(channel: any, message: any): void {
    const attempts = this.retryCount(message);
    const headers = message.properties?.headers ?? {};

    if (attempts < this.maxRetries && this.retryQueue) {
      channel.sendToQueue(this.retryQueue, message.content, {
        persistent: true,
        headers: { ...headers, [RETRY_COUNT_HEADER]: attempts + 1 },
      });
    } else if (this.deadLetterQueue) {
      channel.sendToQueue(this.deadLetterQueue, message.content, {
        persistent: true,
        headers,
      });
    } else {
      // No retry/DLQ configured (should not happen for event queues): drop it
      // rather than hot-requeue.
      channel.nack(message, false, false);
      return;
    }

    // A copy has been re-routed; ack the original so it stops here.
    channel.ack(message);
  }

  /** Retries so far, from the counter header we set on each republish. */
  private retryCount(message: any): number {
    const value = message?.properties?.headers?.[RETRY_COUNT_HEADER];
    return typeof value === 'number' ? value : Number(value) || 0;
  }
}
