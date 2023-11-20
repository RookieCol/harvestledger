import { Module } from '@nestjs/common';
import { FarmsController } from './farms/farms.controller';
import { FarmsService } from './farms/farms.service';
import {
  ActivitiesEntity,
  AwsS3Module,
  CropEntity,
  HarvestEntity,
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
import { CropsService } from './crops/crops.service';
import { ActivitiesService } from './activities/activities.service';
import { HarvestService } from './harvests/harvests.service';

@Module({
  imports: [
    RabbitmqModule,
    PostgresDBModule,
    AwsS3Module,
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
  ],
  providers: [
    FarmsService,
    CropsService,
    ActivitiesService,
    HarvestService,
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
