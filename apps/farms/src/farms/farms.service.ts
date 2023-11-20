import { CreateFarmDto, FarmEntity, UpdateFarmDto } from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository, Not } from 'typeorm';

@Injectable()
export class FarmsService {
  constructor(
    @InjectRepository(FarmEntity)
    private farmsRepository: Repository<FarmEntity>,
    private s3Service: S3Service,
  ) {}

  /* --------------------FARMS---------------------------------------------*/

  async createFarm(createFarmDto: CreateFarmDto) {
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

  async updateFarm(updateFarmDto: UpdateFarmDto, farmId: number) {
    const farm = await this.farmsRepository.findOne({ where: { id: farmId } });
    if (!farm) {
      throw new NotFoundException(`Farm with ID ${farmId} not found`);
    }

    if (updateFarmDto.name) {
      const farmName = await this.farmsRepository.findOne({
        where: { name: Equal(updateFarmDto.name), id: Not(Equal(farmId)) },
      });
      if (farmName) {
        return {
          data: null,
          message: 'Farm name already exists',
          status: 'error',
        };
      }
    }

    try {
      await this.farmsRepository.update(farmId, updateFarmDto);
      const updatedFarm = await this.farmsRepository.findOne({
        where: { id: farmId },
      });

      return {
        data: updatedFarm,
        message: 'Farm updated successfully',
        status: 'success',
      };
    } catch (error) {
      console.error('Error updating Farm:', error);
      return {
        message: 'An error occurred while updating the Farm',
        status: 'error',
        error,
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

    if (!farm.photo) {
      return { message: 'Farm photo not found', status: 'error' };
    }

    const imageData = await this.s3Service.getFile(farm.photo);

    return { message: 'ok', data: imageData };
  }
}
