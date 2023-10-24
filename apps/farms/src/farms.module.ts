import { Module } from '@nestjs/common';
import { FarmsController } from './farms.controller';
import { FarmsService } from './farms.service';
import { ActivitiesEntity, CropEntity, HarvestEntity, PostgresDBModule, RabbitmqModule, RabbitmqService, UserEntity } from '@app/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmEntity } from '@app/common';
import { FarmsRepository } from '@app/common/repositories/farms.repository';
@Module({
  imports: [

    RabbitmqModule,
    PostgresDBModule,
    TypeOrmModule.forFeature([FarmEntity,UserEntity,CropEntity,ActivitiesEntity,HarvestEntity]),
  ],
  controllers: [FarmsController],
  providers: [
    FarmsService,{
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
export class FarmsModule {}
