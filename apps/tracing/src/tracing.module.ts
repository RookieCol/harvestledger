import { Module } from '@nestjs/common';
import { TracingController } from './tracing.controller';
import { TracingService } from './tracing.service';

import { ActivitiesEntity, CropEntity, HarvestEntity, PostgresDBModule, RabbitmqModule, RabbitmqService, UserEntity, FarmEntity } from '@app/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmsRepository } from '@app/common/repositories/farms.repository';

@Module({
  imports: [
    RabbitmqModule,
    PostgresDBModule,
    TypeOrmModule.forFeature([UserEntity, CropEntity, ActivitiesEntity, HarvestEntity, FarmEntity]),
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
      useClass: FarmsRepository,
    },
    {
      provide: 'CropsRepositoryInterface',
      useClass: FarmsRepository,
    },
    {
      provide: 'ActivitiesRepository',
      useClass: FarmsRepository
    },
    {
      provide: 'HarvestRepository',
      useClass: FarmsRepository
    }
  ],
})
export class TracingModule {}
