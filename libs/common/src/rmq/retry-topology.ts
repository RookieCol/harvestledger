import * as amqplib from 'amqplib';

export const REQUEUE_EXCHANGE = 'hl.requeue';
export const RETRY_COUNT_HEADER = 'x-retry-count';

export function retryQueueName(mainQueue: string): string {
  return `${mainQueue}.retry`;
}
export function dlqName(mainQueue: string): string {
  return `${mainQueue}.dlq`;
}

/**
 * Retry-with-backoff + dead-letter topology for an event queue.
 *
 * Deliberately leaves the **main queue vanilla** (no special arguments), because
 * it is also declared by the event emitters and the consumer transport — adding
 * arguments to it would clash (RabbitMQ rejects an inequivalent re-declare). The
 * retry is driven from the consumer side instead (see RmqReliabilityInterceptor):
 *
 *   on failure  →  republish to <main>.retry (a queue with x-message-ttl)
 *   ttl expires →  <main>.retry dead-letters to REQUEUE_EXCHANGE → back to main
 *   after N     →  republish to <main>.dlq
 *
 * Only an *additive binding* (main ← REQUEUE_EXCHANGE) is added to the main
 * queue, which never conflicts with other declarers.
 */
export async function assertRetryTopology(
  url: string,
  mainQueue: string,
  backoffMs: number,
): Promise<void> {
  const connection = await amqplib.connect(url);
  const channel = await connection.createChannel();

  const retryQueue = retryQueueName(mainQueue);
  const deadLetterQueue = dlqName(mainQueue);

  // Vanilla main queue (matches how the transport / emitters declare it), just
  // so we can bind it; the binding itself is additive and conflict-free.
  await channel.assertQueue(mainQueue, { durable: true });

  await channel.assertExchange(REQUEUE_EXCHANGE, 'direct', { durable: true });
  await channel.bindQueue(mainQueue, REQUEUE_EXCHANGE, mainQueue);

  // Retry queue: holds a message for backoffMs, then dead-letters it back to the
  // main queue via the requeue exchange.
  await channel.assertQueue(retryQueue, {
    durable: true,
    arguments: {
      'x-message-ttl': backoffMs,
      'x-dead-letter-exchange': REQUEUE_EXCHANGE,
      'x-dead-letter-routing-key': mainQueue,
    },
  });

  // Final resting place for messages that exhausted their retries.
  await channel.assertQueue(deadLetterQueue, { durable: true });

  await channel.close();
  await connection.close();
}
