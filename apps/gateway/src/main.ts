import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule);
  app.enableCors();
  app.setGlobalPrefix('api/v1');

  // Without this, the class-validator decorators on the DTOs never run.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips properties not declared on the DTO
      forbidNonWhitelisted: true, // and fails if any come through
      transform: true, // converts plain payloads into typed instances
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HarvestLedger API')
    .setDescription(
      'Agricultural traceability: farms, crops, activities and harvests, ' +
        'with an immutable record on IPFS and Polygon.',
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
