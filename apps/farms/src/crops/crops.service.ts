import { CreateCropDto, CropEntity, FarmEntity } from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Equal, Repository } from 'typeorm';

@Injectable()
export class CropsService {
  constructor(
    @InjectRepository(CropEntity)
    private cropsRepository: Repository<CropEntity>,
    @InjectRepository(FarmEntity)
    private farmsRepository: Repository<FarmEntity>,
    private s3Service: S3Service,
    @Inject('TRACING_SERVICE') private readonly tracingClient: ClientProxy,
  ) {}
  /*--------------------------------CROPS---------------------------------------------*/
  async createCrop(createFarmDto: CreateCropDto) {
    const newFarm = this.cropsRepository.create(createFarmDto);
    const savedFarm = await this.cropsRepository.save(newFarm);

    const farm = await this.farmsRepository.findOne({
      where: { id: createFarmDto.farmId },
    });
    this.tracingClient.emit('crop.initialized', {
      cropId: savedFarm.id,
      farmId: farm?.id,
      userId: farm?.user?.id,
      payload: savedFarm,
    });

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
      throw new NotFoundException('Crop not found');
    }

    Object.assign(crop, updateCropDto);
    await this.cropsRepository.save(crop);
    return {
      data: crop,
      message: 'Crop updated successfully',
      status: 'success',
    };
  }

  async deleteCrop(
    cropId: number,
  ): Promise<{ message: string; status: string }> {
    const crop = await this.cropsRepository.find({
      where: { id: Equal(cropId) },
    });

    if (crop.length === 0) {
      throw new NotFoundException('Crop not found');
    }

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
    const url = await this.s3Service.uploadFile(
      file,
      `crop-${cropId}-user-${userId}`,
    );
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId },
    });
    if (!crop) {
      throw new NotFoundException('Crop not found');
    }

    crop.photo = url.key;
    await this.cropsRepository.save(crop);
    return {
      data: url.key,
      message: 'Crop image uploaded successfully',
      status: 'success',
    };
  }

  async getCropPhoto(cropId: number) {
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId },
    });

    if (!crop || !crop.photo) {
      throw new NotFoundException('Crop photo not found');
    }

    const imageData = await this.s3Service.getFile(crop.photo);

    return { message: 'ok', data: imageData };
  }

  // Find a Crop by ID and return all of the crop's information
  async findCropById(cropId: number) {
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId },
      relations: ['farm'],
    });

    if (!crop) {
      throw new NotFoundException('Crop not found');
    }

    return {
      data: crop,
      message: 'success',
      status: 200,
    };
  }
}
