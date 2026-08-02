// MUST be first: starts OpenTelemetry before Nest loads http/pg/amqplib/etc.
import '@app/common/tracing/otel';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { FarmsModule } from './farms.module';
import { ConfigService } from '@nestjs/config';
import { configureRmqMicroservice } from '@app/common';

async function bootstrap() {
  const app = await NestFactory.create(FarmsModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const queue = configService.get('RABBITMQ_FARMS_QUEUE');

  // Validation, RPC error mapping, ack-after-processing and the queue binding
  // — shared with the e2e harness (libs/common/src/rmq).
  configureRmqMicroservice(app, queue);
  await app.startAllMicroservices();

  // HTTP /health for Kubernetes probes alongside the RabbitMQ listener.
  await app.listen(process.env.HEALTH_PORT ?? 3000);
}
bootstrap();
