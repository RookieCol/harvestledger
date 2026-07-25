import { CreateHarvestDto, HarvestEntity, CropEntity } from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Equal, Repository } from 'typeorm';

@Injectable()
export class HarvestService {
  constructor(
    @InjectRepository(HarvestEntity)
    private harvestRepository: Repository<HarvestEntity>,
    @InjectRepository(CropEntity)
    private cropsRepository: Repository<CropEntity>,
    private s3Service: S3Service,
    @Inject('TRACING_SERVICE') private readonly tracingClient: ClientProxy,
  ) {}

  /*-----------------------------HARVEST------------------------------------------------*/
  async createHarvest(createHarvestDto: CreateHarvestDto) {
    const { cropId, ...harvestData } = createHarvestDto;
    const response = await this.isCropHaveHarvest(cropId);

    if (response === true) {
      return {
        data: null,
        message: 'The crop already has a harvest, no more can be added',
        status: 'error',
      };
    } else {
      const newHarvest = this.harvestRepository.create({
        ...harvestData,
        crop: { id: cropId },
      });
      const savedHarvest = await this.harvestRepository.save(newHarvest);

      const cropFinding = await this.findCropById(cropId);
      const crop = cropFinding.data;
      this.tracingClient.emit('harvest.created', {
        cropId,
        farmId: crop?.farm?.id,
        userId: crop?.farm?.user?.id,
        payload: savedHarvest,
      });

      return {
        data: savedHarvest,
        message: 'Created harvest and updated tracing successfully',
        status: 'success',
      };
    }
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

  async uploadHarvestImage(
    file: Express.Multer.File,
    userId: number,
    harvestId: number,
  ) {
    const url = await this.s3Service.uploadFile(
      file,
      `harvest-${harvestId}-user-${userId}`,
    );
    const harvest = await this.harvestRepository.findOne({
      where: { id: harvestId },
    });
    if (!harvest) {
      throw new NotFoundException('Harvest not found');
    }
    harvest.photo = url.key;
    await this.harvestRepository.save(harvest);
    return {
      data: url.key,
      message: 'Harvest image uploaded successfully',
      status: 'success',
    };
  }

  async getHarvestImage(harvestId: number) {
    const harvest = await this.harvestRepository.findOne({
      where: { id: harvestId },
    });

    if (!harvest.photo || harvest.photo === null) {
      return { message: 'Harvest photo not found', status: 'error' };
    }

    const imageData = await this.s3Service.getFile(harvest.photo);

    return { message: 'ok', data: imageData };
  }

  // check if harvest exists in crop
  async isCropHaveHarvest(cropId: number) {
    const response = await this.harvestRepository.find({
      where: { crop: Equal(cropId) },
    });

    if (response.length === 0) {
      return false;
    } else {
      return true;
    }
  }
  // get the crop by id (with its farm and the farm's owning user) for the tracing event
  private async findCropById(cropId: number) {
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
}
