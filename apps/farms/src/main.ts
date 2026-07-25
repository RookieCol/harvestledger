import { NestFactory } from '@nestjs/core';
import { FarmsModule } from './farms.module';
import { ConfigService } from '@nestjs/config';
import { RabbitmqService, buildValidationPipe } from '@app/common';

async function bootstrap() {
  const app = await NestFactory.create(FarmsModule);

  const configService = app.get(ConfigService);
  const BusService = app.get(RabbitmqService);

  const queue = configService.get('RABBITMQ_FARMS_QUEUE');

  // Validate @Payload() DTOs on the @MessagePattern handlers, not just at the gateway.
  app.useGlobalPipes(buildValidationPipe());

  app.connectMicroservice(BusService.getRmqOptions(queue));
  app.startAllMicroservices();
}
bootstrap();
