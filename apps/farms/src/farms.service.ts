import { CropEntity, FarmDto, FarmEntity } from '@app/common';
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
  ) {}

  async createFarm(createFarmDto: FarmDto) {
    const newFarm = this.farmsRepository.create(createFarmDto);
    const savedFarm = await this.farmsRepository.save(newFarm); 
    return {
      data: savedFarm, 
      message: 'Finca creada exitosamente',
      status: 'success',
    };
  }

  async findAllByUserId(userId: number): Promise<{ data: FarmEntity[]; message: string; status: string }> {
    const farms = await this.farmsRepository.find({ where: { user: Equal(userId) } }); // Encuentra las fincas por userId
    return {
      data: farms, 
      message: 'Farms retrieved successfully',
      status: 'success',
    };
  }
  async createCrop(createFarmDto: FarmDto) {
    const newFarm = this.cropsRepository.create(createFarmDto);
    const savedFarm = await this.cropsRepository.save(newFarm); 
    return {
      data: savedFarm, 
      message: 'Created crop successfully',
      status: 'success',
    };
  }

  async findCropsByFarmId(farmId: number): Promise<{ data: CropEntity[]; message: string; status: string }> {
    const crops = await this.cropsRepository.find({ where: { farm: Equal(farmId) } }); // Encuentra las fincas por userId
    return {
      data: crops, 
      message: 'Crops retrieved successfully',
      status: 'success',
    };
  }


}
