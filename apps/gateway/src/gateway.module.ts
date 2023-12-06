import { Module } from '@nestjs/common';
import { RabbitmqModule } from '@app/common';
import { ConfigModule } from '@nestjs/config';
import {
  AuthController,
  FarmsController,
  CropsController,
  ActivitiesController,
  HarvestsController,
  TracingController,
} from './controllers';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env'
    }),
    RabbitmqModule.registerRmq(
      'AUTH_SERVICE',  
      process.env.RABBITMQ_AUTH_QUEUE
    ),
    RabbitmqModule.registerRmq(
      'FARMS_SERVICE',
      process.env.RABBITMQ_FARMS_QUEUE,
    ),
    RabbitmqModule.registerRmq(
      'TRACING_SERVICE',
      process.env.RABBITMQ_TRACING_QUEUE,
    ),
  ],
  controllers: [
    AuthController,
    FarmsController,
    CropsController,
    ActivitiesController,
    HarvestsController,
    TracingController,
  ],
})
export class GatewayModule {}
