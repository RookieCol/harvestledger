import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { buildValidationPipe, HttpExceptionFilter } from '@app/common';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule);

  // Security headers.
  app.use(helmet());

  // Explicit CORS instead of the wide-open default. CORS_ORIGINS is a
  // comma-separated allowlist; unset means same-origin only.
  const corsOrigins = process.env.CORS_ORIGINS;
  app.enableCors({
    origin: corsOrigins ? corsOrigins.split(',').map((o) => o.trim()) : false,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  // Without this, the class-validator decorators on the DTOs never run.
  app.useGlobalPipes(buildValidationPipe());

  // Coherent HTTP errors, including statuses propagated from the microservices.
  app.useGlobalFilters(new HttpExceptionFilter());

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
