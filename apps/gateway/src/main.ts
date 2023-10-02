import { NestFactory } from '@nestjs/core';
import { GatewayModule } from './gateway.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
async function bootstrap() {
  const app = await NestFactory.create(GatewayModule);
  app.enableCors();
  await app.listen(5000);
}
bootstrap();
