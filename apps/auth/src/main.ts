import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module';
import { ConfigService } from '@nestjs/config';
import { RabbitmqService } from '@app/common/services/rabbitmq.service';
import { CreateUser } from './db/user.seed';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule);

  const configService = app.get(ConfigService);
  const BusService = app.get(RabbitmqService);

  const queue = configService.get('RABBITMQ_AUTH_QUEUE');

  app.connectMicroservice(BusService.getRmqOptions(queue));
  app.startAllMicroservices();

  const createAdminUser = new CreateUser(
    app.get('UsersRepositoryInterface'),
    configService,
  );

  await createAdminUser.run();
}
bootstrap();
