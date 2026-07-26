import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { FarmsModule } from './farms.module';
import { ConfigService } from '@nestjs/config';
import {
  RabbitmqService,
  buildValidationPipe,
  RmqReliabilityInterceptor,
  RpcExceptionFilter,
} from '@app/common';

async function bootstrap() {
  const app = await NestFactory.create(FarmsModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const BusService = app.get(RabbitmqService);

  const queue = configService.get('RABBITMQ_FARMS_QUEUE');

  // Validate @Payload() DTOs on the @MessagePattern handlers, not just at the gateway.
  app.useGlobalPipes(buildValidationPipe());
  // Serialize thrown domain exceptions so their status survives the RPC hop.
  app.useGlobalFilters(new RpcExceptionFilter());
  // Ack after processing (not before): crash-safe message handling.
  app.useGlobalInterceptors(new RmqReliabilityInterceptor());

  app.connectMicroservice(BusService.getRmqOptions(queue), {
    inheritAppConfig: true,
  });
  await app.startAllMicroservices();

  // HTTP /health for Kubernetes probes alongside the RabbitMQ listener.
  await app.listen(process.env.HEALTH_PORT ?? 3000);
}
bootstrap();
