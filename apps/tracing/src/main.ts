import { NestFactory } from '@nestjs/core';
import { TracingModule } from './tracing.module';
import { ConfigService } from '@nestjs/config';
import { RabbitmqService, buildValidationPipe } from '@app/common';

async function bootstrap() {
  const app = await NestFactory.create(TracingModule);

  const configService = app.get(ConfigService);
  const BusService = app.get(RabbitmqService);

  const queue = configService.get('RABBITMQ_TRACING_QUEUE');

  // Validate @Payload() DTOs on the @MessagePattern/@EventPattern handlers.
  app.useGlobalPipes(buildValidationPipe());

  app.connectMicroservice(BusService.getRmqOptions(queue));
  app.startAllMicroservices();
}
bootstrap();
