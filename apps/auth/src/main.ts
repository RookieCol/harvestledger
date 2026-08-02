// MUST be first: starts OpenTelemetry before Nest loads http/pg/amqplib/etc.
import '@app/common/tracing/otel';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AuthModule } from './auth.module';
import { ConfigService } from '@nestjs/config';
import { configureRmqMicroservice } from '@app/common';
import { CreateUser } from './db/user.seed';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const queue = configService.get('RABBITMQ_AUTH_QUEUE');

  // Validation, RPC error mapping, ack-after-processing and the queue binding
  // — shared with the e2e harness (libs/common/src/rmq).
  configureRmqMicroservice(app, queue);
  await app.startAllMicroservices();

  // Serve the HTTP /health endpoint for Kubernetes probes alongside the
  // RabbitMQ listener (hybrid app).
  await app.listen(process.env.HEALTH_PORT ?? 3000);

  const createAdminUser = new CreateUser(
    app.get('UsersRepositoryInterface'),
    configService,
  );

  await createAdminUser.run();
}
bootstrap();
