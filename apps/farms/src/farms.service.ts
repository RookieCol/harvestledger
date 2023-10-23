import {
  ActivitiesEntity,
  CreateActivityDto,
  CropEntity,
  FarmDto,
  FarmEntity,
  HarvestEntity,
} from '@app/common';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository } from 'typeorm';

@Injectable()
export class FarmsService {
  constructor(
    @InjectRepository(FarmEntity)
    private farmsRepository: Repository<FarmEntity>,
    @InjectRepository(CropEntity)
    private cropsRepository: Repository<CropEntity>,
    @InjectRepository(ActivitiesEntity)
    private activitiesRepository: Repository<ActivitiesEntity>,
    @InjectRepository(HarvestEntity)
    private harvestRepository: Repository<HarvestEntity>,
  ) {}

  /* --------------------FARMS---------------------------------------------*/

  async createFarm(createFarmDto: FarmDto) {
    const newFarm = this.farmsRepository.create(createFarmDto);
    const savedFarm = await this.farmsRepository.save(newFarm);
    return {
      data: savedFarm,
      message: 'Farm created successfully',
      status: 'success',
    };
  }

  async findAllByUserId(
    userId: number,
  ): Promise<{ data: FarmEntity[]; message: string; status: string }> {
    const farms = await this.farmsRepository.find({
      where: { user: Equal(userId) },
    });
    return {
      data: farms,
      message: 'Farms retrieved successfully',
      status: 'success',
    };
  }

  async deleteFarm(
    farmId: number,
  ): Promise<{ data: any; message: string; status: string }> {
    // Check if the farm exists
    const farm = await this.farmsRepository.find({
      where: { id: Equal(farmId) },
    });

    if (farm.length === 0) {
      return {
        data: farm,
        message: 'Farm not found',
        status: 'error',
      };
    }

    const deletedFarm = await this.farmsRepository.remove(farm);

    return {
      data: deletedFarm,
      message: 'Farm deleted successfully',
      status: 'success',
    };
  }

  /*--------------------------------CROPS---------------------------------------------*/
  async createCrop(createFarmDto: FarmDto) {
    const newFarm = this.cropsRepository.create(createFarmDto);
    const savedFarm = await this.cropsRepository.save(newFarm);
    return {
      data: savedFarm,
      message: 'Created crop successfully',
      status: 'success',
    };
  }

  async findCropsByFarmId(
    farmId: number,
  ): Promise<{ data: CropEntity[]; message: string; status: string }> {
    const crops = await this.cropsRepository.find({
      where: { farm: Equal(farmId) },
      relations: ['farm'],
    }); // Encuentra las fincas por userId
    return {
      data: crops,
      message: 'Crops retrieved successfully',
      status: 'success',
    };
  }

  /*----------------------------ACTIVITIES---------------------------------------------*/
  async createActivity(createActivityDto: CreateActivityDto) {
    const newActivity = this.activitiesRepository.create(createActivityDto);
    const savedActivity = await this.activitiesRepository.save(newActivity);
    return {
      data: savedActivity,
      message: 'Created activity successfully',
      status: 'success',
    };
  }

  async findActivitiesByCropId(
    cropId: number,
  ): Promise<{ data: ActivitiesEntity[]; message: string; status: string }> {
    const activities = await this.activitiesRepository.find({
      where: { crop: Equal(cropId) },
    }); // Encuentra las fincas por userId
    return {
      data: activities,
      message: 'Activities retrieved successfully',
      status: 'success',
    };
  }

  /*-----------------------------HARVEST------------------------------------------------*/

  async createHarvest(createHarvestDto: any) {
    const newHarvest = this.harvestRepository.create(createHarvestDto);
    const savedHarvest = await this.harvestRepository.save(newHarvest);
    return {
      data: savedHarvest,
      message: 'Created harvest successfully',
      status: 'success',
    };
  }

  async findHarvestByCropId(
    cropId: number,
  ): Promise<{ data: HarvestEntity[]; message: string; status: string }> {
    const harvest = await this.harvestRepository.find({
      where: { crop: Equal(cropId) },
    });

    if (harvest.length === 0) {
      return {
        data: null,
        message: 'Harvest not found',
        status: 'error',
      };
    } else {
      return {
        data: harvest,
        message: 'Harvest retrieved successfully',
        status: 'success',
      };
    }
  }
}
