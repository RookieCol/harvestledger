import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module';
import { ConfigService } from '@nestjs/config';
import { RabbitmqService } from '@app/common/services/rabbitmq.service';
import { buildValidationPipe, RpcExceptionFilter } from '@app/common';
import { CreateUser } from './db/user.seed';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule);

  const configService = app.get(ConfigService);
  const BusService = app.get(RabbitmqService);

  const queue = configService.get('RABBITMQ_AUTH_QUEUE');

  // Validate @Payload() DTOs on the @MessagePattern handlers, not just at the gateway.
  app.useGlobalPipes(buildValidationPipe());
  // Serialize thrown domain exceptions so their status survives the RPC hop.
  app.useGlobalFilters(new RpcExceptionFilter());

  app.connectMicroservice(BusService.getRmqOptions(queue));
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
