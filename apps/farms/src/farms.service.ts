import { FarmDto, FarmEntity } from '@app/common';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository } from 'typeorm';

@Injectable()
export class FarmsService {
  constructor(
    @InjectRepository(FarmEntity)
    private farmRepository: Repository<FarmEntity>,
  ) {}

  async createFarm(createFarmDto: FarmDto) {
    const newFarm = this.farmRepository.create(createFarmDto);
    const savedFarm = await this.farmRepository.save(newFarm); 
    return {
      data: savedFarm, 
      message: 'Finca creada exitosamente',
      status: 'success',
    };
  }

  async findAllByUserId(userId: number): Promise<{ data: FarmEntity[]; message: string; status: string }> {
    const farms = await this.farmRepository.find({ where: { user: Equal(userId) } }); // Encuentra las fincas por userId
    return {
      data: farms, 
      message: 'Farms retrieved successfully',
      status: 'success',
    };
  }
}
