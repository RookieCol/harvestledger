import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule);
  app.enableCors();
  app.setGlobalPrefix('api/v1');

  // Sin esto los decoradores de class-validator en los DTOs nunca se ejecutan.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta propiedades no declaradas en el DTO
      forbidNonWhitelisted: true, // y falla si llegan
      transform: true, // convierte payloads planos a instancias tipadas
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HarvestLedger API')
    .setDescription(
      'Trazabilidad agrícola: granjas, cultivos, actividades y cosechas, ' +
        'con registro inmutable en IPFS y Polygon.',
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
