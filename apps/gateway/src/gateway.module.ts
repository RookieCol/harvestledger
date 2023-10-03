import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { RabbitmqModule } from '@app/common/modules/rabbitmq.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:'.env'
    }),

    RabbitmqModule.registerRmq('AUTH_SERVICE',process.env.RABBITMQ_AUTH_QUEUE),
  ],
  controllers: [GatewayController],
})
export class GatewayModule {}
