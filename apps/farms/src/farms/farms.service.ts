import { CreateFarmDto, FarmEntity, UpdateFarmDto } from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository, Not } from 'typeorm';
import { OwnershipService } from '../ownership/ownership.service';

@Injectable()
export class FarmsService {
  constructor(
    @InjectRepository(FarmEntity)
    private farmsRepository: Repository<FarmEntity>,
    private s3Service: S3Service,
    private readonly ownership: OwnershipService,
  ) {}

  /* --------------------FARMS---------------------------------------------*/

  async createFarm(createFarmDto: CreateFarmDto) {
    const farm = await this.farmsRepository.find({
      where: { name: Equal(createFarmDto.name) },
    });

    if (farm.length > 0) {
      throw new ConflictException('Farm already exists');
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

  async updateFarm(
    userId: number,
    updateFarmDto: UpdateFarmDto,
    farmId: number,
  ) {
    await this.ownership.assertFarmOwner(userId, farmId);

    if (updateFarmDto.name) {
      const farmName = await this.farmsRepository.findOne({
        where: { name: Equal(updateFarmDto.name), id: Not(Equal(farmId)) },
      });
      if (farmName) {
        throw new ConflictException('Farm name already exists');
      }
    }

    await this.farmsRepository.update(farmId, updateFarmDto);
    const updatedFarm = await this.farmsRepository.findOne({
      where: { id: farmId },
    });

    return {
      data: updatedFarm,
      message: 'Farm updated successfully',
      status: 'success',
    };
  }

  async deleteFarm(
    userId: number,
    farmId: number,
  ): Promise<{ data: any; message: string; status: string }> {
    const farm = await this.ownership.assertFarmOwner(userId, farmId);

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
    const farm = await this.ownership.assertFarmOwner(userId, farmId);

    const url = await this.s3Service.uploadFile(
      file,
      `farm-${farmId}-user-${userId}`,
    );
    farm.photo = url.key;
    await this.farmsRepository.save(farm);
    return {
      data: url.key,
      message: 'Farm image uploaded successfully',
      status: 'success',
    };
  }

  async getFarmImage(userId: number, farmId: number) {
    const farm = await this.ownership.assertFarmOwner(userId, farmId);

    if (!farm.photo) {
      throw new NotFoundException('Farm photo not found');
    }

    const imageData = await this.s3Service.getFile(farm.photo);

    return { message: 'ok', data: imageData };
  }
}
