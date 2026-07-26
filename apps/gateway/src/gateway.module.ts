import { Module } from '@nestjs/common';
import {
  AppLoggerModule,
  HealthModule,
  MetricsModule,
  RabbitmqModule,
  envValidationSchema,
} from '@app/common';
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
    AppLoggerModule,
    MetricsModule,
    // Per-pod rate limit (window + max requests configurable so it can be
    // raised for load tests). Defaults: 100 requests / 60s.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
    HealthModule,
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
