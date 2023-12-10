import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Equal } from 'typeorm';

import { CropEntity, ActivitiesEntity, FarmEntity, HarvestEntity  } from '@app/common';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(FarmEntity)
    private farmRepository: Repository<FarmEntity>,
    @InjectRepository(CropEntity)
    private cropRepository: Repository<CropEntity>,
    @InjectRepository(ActivitiesEntity)
    private activitiesRepository: Repository<ActivitiesEntity>,
    @InjectRepository(HarvestEntity)
    private harvestRepository: Repository<HarvestEntity>,
  ) {}

  async generateFarmerReport(farmer_id: number) {
    // extraemos los farms primero según el farmer_id
    try {
      const farms = await this.farmRepository.createQueryBuilder('farms')
        .select(['farms.id', 'farms.name', 'farms.state', 'farms.location', 'farms.area', 'farms.user'])
        .where('farms.user = :userId', { userId: farmer_id })
        .getMany();
      const allInfo = await this.getCropsByFarmId(farms);
      return { result: allInfo, status: 'success' };
    } catch (error) {
      console.log('error: ', error);
      return { result: null, status: 'error' };
    }
  }
  
  // Metodo para obtener los crops por cada farm
  async getCropsByFarmId(farms: any) {
    for(const farm of farms) {
      const crops = await this.cropRepository.createQueryBuilder('crops')
        .select(['crops.id', 'crops.name', 'crops.product', 'crops.size', 'crops.location', 'crops.sowingDate', 'crops.plants'])
        .where('crops.farm = :farmId', { farmId: farm.id })
        .getMany();

      farm.crops = await this.getActivitiesByCropId(crops);
      farm.crops = await this.getHarvestByCropId(crops);
    }

    return farms;
  }
  // Metodo para obtener las actividades por cada crop
  async getActivitiesByCropId(crops: any) {
    for(const crop of crops) {
      const activities = await this.activitiesRepository.createQueryBuilder('activities')
        .select(['activities.type', 'activities.inputDate', 'activities.title', 'activities.manufactureLocation', 'activities.appRatio', 'activities.appMethod', 'activities.comment', 'activities.category', 'activities.bioName', 'activities.bioType'])
        .where('activities.crop = :cropId', { cropId: crop.id })
        .getMany();

      crop.activities = activities;
    }
    return crops;
  }
  // Metodo para obtener los harvest por cada crop
  async getHarvestByCropId(crops: any) {
    for(const crop of crops) {
      const harvest = await this.harvestRepository.createQueryBuilder('harvest')
        .select(['harvest.harvestDate', 'harvest.amount', 'harvest.unit', 'harvest.category', 'harvest.description'])
        .where('harvest.crop = :cropId', { cropId: crop.id })
        .getMany();

      crop.harvests = harvest;
    }
    return crops;
  }
}