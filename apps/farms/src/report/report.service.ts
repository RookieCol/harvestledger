import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Equal } from 'typeorm';

import {
  CropEntity,
  ActivitiesEntity,
  FarmEntity,
  HarvestEntity,
  UserEntity,
} from '@app/common';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(FarmEntity)
    private farmRepository: Repository<FarmEntity>,
    @InjectRepository(CropEntity)
    private cropRepository: Repository<CropEntity>,
    @InjectRepository(ActivitiesEntity)
    private activitiesRepository: Repository<ActivitiesEntity>,
    @InjectRepository(HarvestEntity)
    private harvestRepository: Repository<HarvestEntity>,
  ) {}

  async generateAdminReport(req_id: number) {
    // buscamos el usuario que envio la petición
    const user = await this.userRepository.findOne({
      where: { id: req_id },
    });

    // Si el usuario no es admin, mandamos error.
    if (user.rol !== 'admin') {
      return {
        result: null,
        message: 'usuario no autorizado',
        status: 'error',
      };
    }

    // si el usuario es el administrador, continuamos
    // buscamos todos los usuarios
    try {
      const users = await this.userRepository
        .createQueryBuilder('users')
        .select([
          'users.id',
          'users.firstName',
          'users.lastName',
          'users.email',
          'users.gender',
          'users.documentType',
          'users.documentNumber',
          'users.dateOfBirth',
          'users.country',
          'users.state',
          'users.city',
          'users.rol',
        ])
        .getMany();
      const allInfo = await this.getFarmsByUserId(users);
      return { result: allInfo, status: 'success' };
    } catch (error) {
      console.log('error: ', error);
      return { result: null, status: 'error', message: 'error de servidor' };
    }
  }

  async generateFarmerReport(farmer_id: number, req_id: number) {
    // construcción para verificar que el usuario buscado es realmente quien envio la petición
    const user = await this.userRepository.findOne({
      where: { id: req_id },
    });
    if (farmer_id !== user.id) {
      return {
        result: null,
        message: 'usuario no autorizado',
        status: 'error',
      };
    }

    // extraemos los farms primero según el farmer_id
    try {
      const farms = await this.farmRepository
        .createQueryBuilder('farms')
        .select([
          'farms.id',
          'farms.name',
          'farms.state',
          'farms.location',
          'farms.area',
          'farms.user',
        ])
        .where('farms.user = :userId', { userId: farmer_id })
        .getMany();
      const allInfo = await this.getCropsByFarmId(farms);
      return { result: allInfo, status: 'success' };
    } catch (error) {
      console.log('error: ', error);
      return { result: null, status: 'error' };
    }
  }

  // Metodo para obtener todos los farms por cada user
  async getFarmsByUserId(users: any) {
    for (const user of users) {
      const farms = await this.farmRepository
        .createQueryBuilder('farms')
        .select([
          'farms.id',
          'farms.name',
          'farms.state',
          'farms.location',
          'farms.area',
          'farms.user',
        ])
        .where('farms.user = :userId', { userId: user.id })
        .getMany();

      user.farms = await this.getCropsByFarmId(farms);
    }

    return users;
  }

  // Metodo para obtener los crops por cada farm
  async getCropsByFarmId(farms: any) {
    for (const farm of farms) {
      const crops = await this.cropRepository
        .createQueryBuilder('crops')
        .select([
          'crops.id',
          'crops.name',
          'crops.product',
          'crops.size',
          'crops.location',
          'crops.sowingDate',
          'crops.plants',
        ])
        .where('crops.farm = :farmId', { farmId: farm.id })
        .getMany();

      farm.crops = await this.getActivitiesByCropId(crops);
      farm.crops = await this.getHarvestByCropId(crops);
    }

    return farms;
  }
  // Metodo para obtener las actividades por cada crop
  async getActivitiesByCropId(crops: any) {
    for (const crop of crops) {
      const activities = await this.activitiesRepository
        .createQueryBuilder('activities')
        .select([
          'activities.type',
          'activities.inputDate',
          'activities.title',
          'activities.manufactureLocation',
          'activities.appRatio',
          'activities.appMethod',
          'activities.comment',
          'activities.category',
          'activities.bioName',
          'activities.bioType',
        ])
        .where('activities.crop = :cropId', { cropId: crop.id })
        .getMany();

      crop.activities = activities;
    }
    return crops;
  }
  // Metodo para obtener los harvest por cada crop
  async getHarvestByCropId(crops: any) {
    for (const crop of crops) {
      const harvest = await this.harvestRepository
        .createQueryBuilder('harvest')
        .select([
          'harvest.harvestDate',
          'harvest.amount',
          'harvest.unit',
          'harvest.category',
          'harvest.description',
        ])
        .where('harvest.crop = :cropId', { cropId: crop.id })
        .getMany();

      crop.harvests = harvest;
    }
    return crops;
  }
}
