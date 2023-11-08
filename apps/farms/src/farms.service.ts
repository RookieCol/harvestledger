import {
  ActivitiesEntity,
  CreateActivityDto,
  CropEntity,
  FarmDto,
  FarmEntity,
  HarvestEntity,
} from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buffer } from 'stream/consumers';
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
    private s3Service: S3Service,
  ) {}

  /* --------------------FARMS---------------------------------------------*/

  async createFarm(createFarmDto: FarmDto) {
    const farm = await this.farmsRepository.find({
      where: { name: Equal(createFarmDto.name) },
    });

    if (farm.length > 0) {
      return {
        data: null,
        message: 'Farm already exists',
        status: 'error',
      };
    }

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

  async updateFarm(updateFarmDto: any, farmId: number) {
    const farm = await this.farmsRepository.findOne({
      where: { id: farmId },
    });

    if (!farm) {
      return {
        data: null,
        message: 'Farm not found',
        status: 'error',
      };
    }
    const farmName = await this.farmsRepository.find({
      where: { name: Equal(updateFarmDto.updateFarmDto.name) },
    });
    if (farmName.length > 0) {
      return {
        data: null,
        message: 'Farm name already exists',
        status: 'error',
      };
    }
    try {
      Object.assign(farm, updateFarmDto.updateFarmDto);
      await this.farmsRepository.save(farm);
      return {
        data: farm,
        message: 'Farm updated successfully',
        status: 'success',
      };
    } catch (error) {
      console.error('Error updating Farm:', error);
      return {
        message: 'An error occurred while updating the Farm',
        status: 'error',
      };
    }
  }

  async deleteFarm(
    farmId: number,
  ): Promise<{ data: any; message: string; status: string }> {
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

  async uploadFarmImage(
    file: Express.Multer.File,
    userId: number,
    farmId: number,
  ) {
    const url = await this.s3Service.uploadFile(
      file,
      `farm-${farmId}-user-${userId}`,
    );
    const farm = await this.farmsRepository.findOne({
      where: { id: farmId },
    });
    farm.photo = url.key;
    await this.farmsRepository.save(farm);
    return {
      data: url.key,
      message: 'Farm image uploaded successfully',
      status: 'success',
    };
  }

  async getFarmImage(farmId: number) {
    const farm = await this.farmsRepository.findOne({ where: { id: farmId } });

    if (!farm) {
      throw new NotFoundException('Farm not found');
    }

    const imageData = await this.s3Service.getFile(farm.photo);

    return { message: 'ok', data: imageData };
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
    });
    return {
      data: crops,
      message: 'Crops retrieved successfully',
      status: 'success',
    };
  }
  async updateCrop(updateCropDto: any, cropId: number) {
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId },
    });

    if (!crop) {
      return {
        data: null,
        message: 'Crop not found',
        status: 'error',
      };
    }

    try {
      Object.assign(crop, updateCropDto.updateCropDto);
      await this.cropsRepository.save(crop);
      return {
        data: crop,
        message: 'Crop updated successfully',
        status: 'success',
      };
    } catch (error) {
      console.error('Error updating Crop:', error);
      return {
        data: null,
        message: 'An error occurred while updating the Crop',
        status: 'error',
      };
    }
  }

  async deleteCrop(
    cropId: number,
  ): Promise<{ message: string; status: string }> {
    const crop = await this.cropsRepository.find({
      where: { id: Equal(cropId) },
    });

    if (crop.length === 0) {
      return {
        message: 'Crop not found',
        status: 'error',
      };
    }

    await this.cropsRepository.remove(crop);

    return {
      message: 'Crop deleted successfully',
      status: 'success',
    };
  }
  async uploadCropImage(
    file: Express.Multer.File,
    userId: number,
    cropId: number,
  ) {
    const url = await this.s3Service.uploadFile(
      file,
      `crop-${cropId}-user-${userId}`,
    );
    const farm = await this.farmsRepository.findOne({
      where: { id: cropId },
    });
    farm.photo = url.key;
    await this.farmsRepository.save(farm);
    return {
      data: url.key,
      message: 'Farm image uploaded successfully',
      status: 'success',
    };
  }

  async getCropImage(cropId: number) {
    const crop = await this.cropsRepository.findOne({
      where: { id: Equal(cropId) },
    });

    if (!crop) {
      throw new NotFoundException('Crop not found');
    }

    const imageData = await this.s3Service.getFile(crop.photo);

    return { message: 'ok', data: imageData };
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
    });
    return {
      data: activities,
      message: 'Activities retrieved successfully',
      status: 'success',
    };
  }

  async updateActivity(updateActivityDto: any, activityId: number) {
    const activity = await this.activitiesRepository.findOne({
      where: { id: activityId },
    });

    if (!activity) {
      return {
        data: null,
        message: 'Activity not found',
        status: 'error',
      };
    }

    try {
      Object.assign(activity, updateActivityDto.updateActivityDto);
      await this.activitiesRepository.save(activity);
      return {
        data: activity,
        message: 'Activity updated successfully',
        status: 'success',
      };
    } catch (error) {
      console.error('Error updating Activity:', error);
      return {
        data: null,
        message: 'An error occurred while updating the Activity',
        status: 'error',
      };
    }
  }

  async deleteActivity(
    activityId: number,
  ): Promise<{ data: any; message: string; status: string }> {
    const activity = await this.activitiesRepository.find({
      where: { id: Equal(activityId) },
    });

    if (activity.length === 0) {
      return {
        data: activity,
        message: 'Activity not found',
        status: 'error',
      };
    }

    const deletedActivity = await this.activitiesRepository.remove(activity);

    return {
      data: deletedActivity,
      message: 'Activity deleted successfully',
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

  async deleteHarvest(
    harvestId: number,
  ): Promise<{ data: any; message: string; status: string }> {
    // Check if the farm exists
    const harvest = await this.harvestRepository.find({
      where: { id: Equal(harvestId) },
    });

    if (harvest.length === 0) {
      return {
        data: harvest,
        message: 'Harvest not found',
        status: 'error',
      };
    }

    const deletedHarvest = await this.harvestRepository.remove(harvest);

    return {
      data: deletedHarvest,
      message: 'Harvest deleted successfully',
      status: 'success',
    };
  }

  async updateHarvest(updateHarvestDto: any, harvestId: number) {
    const harvest = await this.harvestRepository.findOne({
      where: { id: harvestId },
    });

    if (!harvest) {
      return {
        data: null,
        message: 'Harvest not found',
        status: 'error',
      };
    }

    try {
      Object.assign(harvest, updateHarvestDto.updateHarvestDto);
      await this.harvestRepository.save(harvest);
      return {
        data: harvest,
        message: 'Harvest updated successfully',
        status: 'success',
      };
    } catch (error) {
      console.error('Error updating Harvest:', error);
      return {
        data: null,
        message: 'An error occurred while updating the Harvest',
        status: 'error',
      };
    }
  }
}
