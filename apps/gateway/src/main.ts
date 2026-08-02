// MUST be first: starts OpenTelemetry before Nest loads http/pg/amqplib/etc.
import '@app/common/tracing/otel';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { GatewayModule } from './gateway.module';
import { configureGateway } from './setup';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Helmet, CORS, the api/v1 prefix, the ValidationPipe and the exception
  // filter — shared with the e2e harness (apps/gateway/src/setup.ts).
  configureGateway(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HarvestLedger API')
    .setDescription(
      'Agricultural traceability: farms, crops, activities and harvests, ' +
        'with an append-only event history in MongoDB.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  await app.listen(5000);
}
bootstrap();
