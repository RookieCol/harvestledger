import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { TracingController } from './tracing.controller';
import { TracingService } from './tracing.service';
import {
  HealthModule,
  MongoDBModule,
  RabbitmqModule,
  RabbitmqService,
  TracingEvent,
  TracingEventSchema,
} from '@app/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: './.env',
    }),
    RabbitmqModule,
    MongoDBModule,
    HealthModule,
    MongooseModule.forFeature([
      { name: TracingEvent.name, schema: TracingEventSchema },
    ]),
  ],
  controllers: [TracingController],
  providers: [
    {
      provide: 'TracingServiceInterface',
      useClass: TracingService,
    },
    {
      provide: 'RabbitmqServiceInterface',
      useClass: RabbitmqService,
    },
  ],
})
export class TracingModule {}
