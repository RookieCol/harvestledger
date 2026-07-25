import { Module } from '@nestjs/common';
import { FarmsController } from './farms/farms.controller';
import { FarmsService } from './farms/farms.service';
import { ConfigModule } from '@nestjs/config';

import {
  ActivitiesEntity,
  AwsS3Module,
  CropEntity,
  HarvestEntity,
  HealthModule,
  PostgresDBModule,
  RabbitmqModule,
  RabbitmqService,
  UserEntity,
} from '@app/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmEntity } from '@app/common';
import { FarmsRepository } from '@app/common/repositories/farms.repository';
import { CropsController } from './crops/crops.controller';
import { HarvestsController } from './harvests/harvest.controllers';
import { ActivitiesController } from './activities/activities.controller';
import { ReportController } from './report/report.controller';
import { CropsService } from './crops/crops.service';
import { ActivitiesService } from './activities/activities.service';
import { HarvestService } from './harvests/harvests.service';
import { ReportService } from './report/report.service';
import { OwnershipService } from './ownership/ownership.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: './.env',
    }),
    RabbitmqModule,
    RabbitmqModule.registerRmq(
      'TRACING_SERVICE',
      process.env.RABBITMQ_TRACING_QUEUE,
    ),
    PostgresDBModule,
    AwsS3Module,
    HealthModule,
    TypeOrmModule.forFeature([
      FarmEntity,
      UserEntity,
      CropEntity,
      ActivitiesEntity,
      HarvestEntity,
    ]),
  ],
  controllers: [
    FarmsController,
    CropsController,
    HarvestsController,
    ActivitiesController,
    ReportController,
  ],
  providers: [
    FarmsService,
    CropsService,
    ActivitiesService,
    HarvestService,
    ReportService,
    OwnershipService,
    {
      provide: 'RabbitmqServiceInterface',
      useClass: RabbitmqService,
    },
    {
      provide: 'FarmsRepositoryInterface',
      useClass: FarmsRepository,
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
export class FarmsModule {}
