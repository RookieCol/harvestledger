import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { TracingController } from './tracing.controller';
import { TracingService } from './tracing.service';
import {
  ActivitiesEntity,
  CropEntity,
  HarvestEntity,
  PostgresDBModule,
  RabbitmqModule,
  RabbitmqService,
  UserEntity,
  FarmEntity,
} from '@app/common';
import { FarmsRepository } from '@app/common/repositories/farms.repository';
import { FarmsService } from 'apps/farms/src/farms.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: './.env',
    }),
    RabbitmqModule,
    PostgresDBModule,
    TypeOrmModule.forFeature([
      UserEntity,
      CropEntity,
      ActivitiesEntity,
      HarvestEntity,
      FarmEntity,
    ]),
  ],
  controllers: [TracingController],
  providers: [
    TracingService,
    {
      provide: 'RabbitmqServiceInterface',
      useClass: RabbitmqService,
    },
    {
      provide: 'FarmsRepositoryInterface',
      useClass: FarmsService,
    },
    {
      provide: 'CropsRepositoryInterface',
      useClass: FarmsRepository,
    },
    {
      provide: 'ActivitiesRepository',
      useClass: FarmsRepository,
    },
    {
      provide: 'HarvestRepository',
      useClass: FarmsRepository,
    },
  ],
})
export class TracingModule {}
