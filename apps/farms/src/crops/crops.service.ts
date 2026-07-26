import { CreateCropDto, CropEntity, FarmEntity } from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Equal, Repository } from 'typeorm';
import { OwnershipService } from '../ownership/ownership.service';

@Injectable()
export class CropsService {
  constructor(
    @InjectRepository(CropEntity)
    private cropsRepository: Repository<CropEntity>,
    @InjectRepository(FarmEntity)
    private farmsRepository: Repository<FarmEntity>,
    private s3Service: S3Service,
    private readonly ownership: OwnershipService,
    @Inject('TRACING_SERVICE') private readonly tracingClient: ClientProxy,
  ) {}
  /*--------------------------------CROPS---------------------------------------------*/
  async createCrop(userId: number, createCropDto: CreateCropDto) {
    // The crop is created under a farm — that farm must belong to the requester.
    const { farmId, ...cropData } = createCropDto;
    const farm = await this.ownership.assertFarmOwner(userId, farmId);

    // Map farmId to the farm relation — TypeORM won't set the FK from a plain
    // `farmId` field, which left crops orphaned (no farm) and unownable.
    const newCrop = this.cropsRepository.create({
      ...cropData,
      farm: { id: farmId },
    });
    const savedCrop = await this.cropsRepository.save(newCrop);

    this.tracingClient.emit('crop.initialized', {
      cropId: savedCrop.id,
      farmId: farm.id,
      userId: farm.user?.id,
      payload: savedCrop,
    });

    return {
      data: savedCrop,
      message: 'Created crop successfully',
      status: 'success',
    };
  }

  async findCropsByFarmId(
    userId: number,
    farmId: number,
  ): Promise<{ data: CropEntity[]; message: string; status: string }> {
    await this.ownership.assertFarmOwner(userId, farmId);
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
  async updateCrop(userId: number, updateCropDto: any, cropId: number) {
    const crop = await this.ownership.assertCropOwner(userId, cropId);

    Object.assign(crop, updateCropDto);
    await this.cropsRepository.save(crop);
    return {
      data: crop,
      message: 'Crop updated successfully',
      status: 'success',
    };
  }

  async deleteCrop(
    userId: number,
    cropId: number,
  ): Promise<{ message: string; status: string }> {
    const crop = await this.ownership.assertCropOwner(userId, cropId);

    await this.cropsRepository.remove(crop);

    return {
      message: 'Crop deleted successfully',
      status: 'success',
    };
  }
  async uploadCropPhoto(
    file: Express.Multer.File,
    userId: number,
    cropId: number,
  ) {
    const crop = await this.ownership.assertCropOwner(userId, cropId);

    const url = await this.s3Service.uploadFile(
      file,
      `crop-${cropId}-user-${userId}`,
    );
    crop.photo = url.key;
    await this.cropsRepository.save(crop);
    return {
      data: url.key,
      message: 'Crop image uploaded successfully',
      status: 'success',
    };
  }

  async getCropPhoto(userId: number, cropId: number) {
    const crop = await this.ownership.assertCropOwner(userId, cropId);

    if (!crop.photo) {
      throw new NotFoundException('Crop photo not found');
    }

    const imageData = await this.s3Service.getFile(crop.photo);

    return { message: 'ok', data: imageData };
  }

  // Find a Crop by ID and return all of the crop's information
  async findCropById(userId: number, cropId: number) {
    const crop = await this.ownership.assertCropOwner(userId, cropId);

    return {
      data: crop,
      message: 'success',
      status: 200,
    };
  }
}
