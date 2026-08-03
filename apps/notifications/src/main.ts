// MUST be first: starts OpenTelemetry before Nest loads http/pg/amqplib/etc.
import '@app/common/tracing/otel';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { NotificationsAppModule } from './notifications.module';
import { ConfigService } from '@nestjs/config';
import {
  configureRmqMicroservice,
  assertRetryTopology,
  retryQueueName,
  dlqName,
} from '@app/common';

// Retry the event a few times with a fixed backoff before parking it in the DLQ.
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 5000;

async function bootstrap() {
  const app = await NestFactory.create(NotificationsAppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);

  const queue = configService.get('RABBITMQ_NOTIFICATIONS_QUEUE');
  const rmqUrl = `amqp://${configService.get('RABBITMQ_USER')}:${configService.get(
    'RABBITMQ_PASS',
  )}@${configService.get('RABBITMQ_HOST')}`;

  // Declare the retry/DLQ topology before consuming, so failed events cycle
  // through the backoff queue and land in the DLQ after MAX_RETRIES.
  await assertRetryTopology(rmqUrl, queue, RETRY_BACKOFF_MS);

  // Validation, RPC error mapping and the queue binding — shared with the e2e
  // harness. Like tracing, this service consumes events, so a failure retries
  // with backoff and then dead-letters instead of being dropped: a welcome
  // email that fails on a flaky SMTP host should be retried, not lost.
  configureRmqMicroservice(app, queue, {
    maxRetries: MAX_RETRIES,
    retryQueue: retryQueueName(queue),
    deadLetterQueue: dlqName(queue),
  });
  await app.startAllMicroservices();

  // HTTP /health for Kubernetes probes alongside the RabbitMQ listener.
  await app.listen(process.env.HEALTH_PORT ?? 3000);
}
bootstrap();
