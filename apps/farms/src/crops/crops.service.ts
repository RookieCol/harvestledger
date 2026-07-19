import { CropEntity, FarmEntity } from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository } from 'typeorm';

@Injectable()
export class CropsService {
  constructor(
    @InjectRepository(CropEntity)
    private cropsRepository: Repository<CropEntity>,
    @InjectRepository(FarmEntity)
    private farmsRepository: Repository<FarmEntity>,
    private s3Service: S3Service,
  ) {}
  /*--------------------------------CROPS---------------------------------------------*/
  async createCrop(createFarmDto: any) {
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
      Object.assign(crop, updateCropDto);
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

    if (!crop.photo || crop.photo === null) {
      return { message: 'Crop photo not found', status: 'error' };
    }

    const imageData = await this.s3Service.getFile(crop.photo);

    return { message: 'ok', data: imageData };
  }

  // Encontrar un Crop dando un ID y devolver toda la información del crop
  async findCropById(cropId: number) {
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId },
      relations: ['farm'],
    });

    if (crop != null) {
      return {
        data: crop,
        message: 'success',
        status: 200,
      };
    } else {
      return {
        message: 'error',
        status: 400,
      };
    }
  }
  // updateCrop para hacer el init tracing
  async updateCropTracing(updateCrop: any, cropId: number) {
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId },
    });
    // verifico si el crop ha sido encontrado
    if (!crop) {
      return {
        data: null,
        message: 'Crop not found',
        status: 404,
      };
    }
    // una vez encontrado el crop, actualizo sus datos
    try {
      const newCrop = { ...crop, ...updateCrop };
      const resUpdateCrop = await this.cropsRepository.save(newCrop);
      return {
        data: { ...resUpdateCrop },
        message: 'Crop updated successfully',
        status: 200,
      };
    } catch (error) {
      console.error('Error updating Crop:', error);
      return {
        data: null,
        message: 'An error occurred while updating the Crop',
        status: 500,
      };
    }
  }
}
