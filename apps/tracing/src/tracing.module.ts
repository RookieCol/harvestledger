import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { S3Service } from '@app/common/services/s3.service';

import { TracingController } from './tracing.controller';
import { TracingService } from './tracing.service';
import {
  PostgresDBModule,
  RabbitmqModule,
  RabbitmqService,

  UserEntity,
  CropEntity,
  ActivitiesEntity,
  HarvestEntity,
  FarmEntity,

  // CropsRepository,
  // ActivitiesRepository,
  // HarvestsRepository,
  // FarmsRepository
} from '@app/common';
import { CropsService } from 'apps/farms/src/crops/crops.service';
import { HarvestService } from 'apps/farms/src/harvests/harvests.service';

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
    S3Service,
    {
      provide: 'TracingServiceInterface',
      useClass: TracingService,
    },
    {
      provide: 'RabbitmqServiceInterface',
      useClass: RabbitmqService,
    },
    // {
    //   provide: 'FarmsRepositoryInterface',
    //   useClass: FarmsRepository,
    // },
    {
      provide: 'CropsServiceInterface',
      useClass: CropsService,
    },
    // {
    //   provide: 'CropsRepositoryInterface',
    //   useClass: CropsRepository,
    // },
    {
      provide: 'HarvestServiceInterface',
      useClass: HarvestService,
    },
    // {
    //   provide: 'HarvestRepository',
    //   useClass: FarmsRepository,
    // },
  ],
})
export class TracingModule {}
