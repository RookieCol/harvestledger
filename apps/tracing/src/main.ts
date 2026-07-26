// MUST be first: starts OpenTelemetry before Nest loads http/pg/amqplib/etc.
import '@app/common/tracing/otel';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { TracingModule } from './tracing.module';
import { ConfigService } from '@nestjs/config';
import {
  RabbitmqService,
  buildValidationPipe,
  RmqReliabilityInterceptor,
  RpcExceptionFilter,
  assertRetryTopology,
  retryQueueName,
  dlqName,
} from '@app/common';

// Retry the event a few times with a fixed backoff before parking it in the DLQ.
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 5000;

async function bootstrap() {
  const app = await NestFactory.create(TracingModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const BusService = app.get(RabbitmqService);

  const queue = configService.get('RABBITMQ_TRACING_QUEUE');
  const rmqUrl = `amqp://${configService.get('RABBITMQ_USER')}:${configService.get(
    'RABBITMQ_PASS',
  )}@${configService.get('RABBITMQ_HOST')}`;

  // Declare the retry/DLQ topology before consuming, so failed events cycle
  // through the backoff queue and land in the DLQ after MAX_RETRIES.
  await assertRetryTopology(rmqUrl, queue, RETRY_BACKOFF_MS);

  // Validate @Payload() DTOs on the @MessagePattern/@EventPattern handlers.
  app.useGlobalPipes(buildValidationPipe());
  // Serialize thrown domain exceptions so their status survives the RPC hop.
  app.useGlobalFilters(new RpcExceptionFilter());
  // Ack after processing; failed events retry-with-backoff then dead-letter.
  app.useGlobalInterceptors(
    new RmqReliabilityInterceptor({
      maxRetries: MAX_RETRIES,
      retryQueue: retryQueueName(queue),
      deadLetterQueue: dlqName(queue),
    }),
  );

  app.connectMicroservice(BusService.getRmqOptions(queue), {
    inheritAppConfig: true,
  });
  await app.startAllMicroservices();

  // HTTP /health for Kubernetes probes alongside the RabbitMQ listener.
  await app.listen(process.env.HEALTH_PORT ?? 3000);
}
bootstrap();
