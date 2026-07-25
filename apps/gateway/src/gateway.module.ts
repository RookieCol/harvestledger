import { Module } from '@nestjs/common';
import { RabbitmqModule, envValidationSchema } from '@app/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  AuthController,
  FarmsController,
  CropsController,
  ActivitiesController,
  HarvestsController,
  TracingController,
  ReportController,
} from './controllers';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: envValidationSchema,
    }),
    // Basic rate limiting: 100 requests per minute per client.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    RabbitmqModule.registerRmq('AUTH_SERVICE', process.env.RABBITMQ_AUTH_QUEUE),
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
    ReportController,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class GatewayModule {}
