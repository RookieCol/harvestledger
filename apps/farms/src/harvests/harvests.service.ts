import { CreateHarvestDto, HarvestEntity } from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Equal, Repository } from 'typeorm';
import { OwnershipService } from '../ownership/ownership.service';
import { OutboxService } from '../outbox/outbox.service';

@Injectable()
export class HarvestService {
  constructor(
    @InjectRepository(HarvestEntity)
    private harvestRepository: Repository<HarvestEntity>,
    private s3Service: S3Service,
    private readonly ownership: OwnershipService,
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  /*-----------------------------HARVEST------------------------------------------------*/
  async createHarvest(userId: number, createHarvestDto: CreateHarvestDto) {
    const { cropId, ...harvestData } = createHarvestDto;
    // The harvest is created under a crop — that crop must belong to the user.
    const crop = await this.ownership.assertCropOwner(userId, cropId);

    const alreadyHarvested = await this.isCropHaveHarvest(cropId);
    if (alreadyHarvested) {
      throw new ConflictException(
        'The crop already has a harvest, no more can be added',
      );
    }

    // Domain write + tracing event in one transaction (transactional outbox).
    const savedHarvest = await this.dataSource.transaction(async (manager) => {
      const newHarvest = manager.create(HarvestEntity, {
        ...harvestData,
        crop: { id: cropId },
      });
      const saved = await manager.save(newHarvest);
      await this.outbox.enqueue(manager, 'harvest.created', {
        cropId,
        farmId: crop.farm?.id,
        userId: crop.farm?.user?.id,
        payload: saved,
      });
      return saved;
    });

    return {
      data: savedHarvest,
      message: 'Created harvest and updated tracing successfully',
      status: 'success',
    };
  }

  async findHarvestByCropId(
    userId: number,
    cropId: number,
  ): Promise<{ data: HarvestEntity[]; message: string; status: string }> {
    await this.ownership.assertCropOwner(userId, cropId);
    const harvest = await this.harvestRepository.find({
      where: { crop: Equal(cropId) },
    });

    // An empty result is a valid "no harvest yet", not an error.
    return {
      data: harvest,
      message: 'Harvest retrieved successfully',
      status: 'success',
    };
  }

  async deleteHarvest(
    userId: number,
    harvestId: number,
  ): Promise<{ data: any; message: string; status: string }> {
    const harvest = await this.ownership.assertHarvestOwner(userId, harvestId);

    const deletedHarvest = await this.harvestRepository.remove(harvest);

    return {
      data: deletedHarvest,
      message: 'Harvest deleted successfully',
      status: 'success',
    };
  }

  async updateHarvest(
    userId: number,
    updateHarvestDto: any,
    harvestId: number,
  ) {
    const harvest = await this.ownership.assertHarvestOwner(userId, harvestId);

    Object.assign(harvest, updateHarvestDto);
    await this.harvestRepository.save(harvest);
    return {
      data: harvest,
      message: 'Harvest updated successfully',
      status: 'success',
    };
  }

  async uploadHarvestImage(
    file: Express.Multer.File,
    userId: number,
    harvestId: number,
  ) {
    const harvest = await this.ownership.assertHarvestOwner(userId, harvestId);

    const url = await this.s3Service.uploadFile(
      file,
      `harvest-${harvestId}-user-${userId}`,
    );
    harvest.photo = url.key;
    await this.harvestRepository.save(harvest);
    return {
      data: url.key,
      message: 'Harvest image uploaded successfully',
      status: 'success',
    };
  }

  async getHarvestImage(userId: number, harvestId: number) {
    const harvest = await this.ownership.assertHarvestOwner(userId, harvestId);

    if (!harvest.photo) {
      throw new NotFoundException('Harvest photo not found');
    }

    const imageData = await this.s3Service.getFile(harvest.photo);

    return { message: 'ok', data: imageData };
  }

  // check if harvest exists in crop
  async isCropHaveHarvest(cropId: number) {
    const response = await this.harvestRepository.find({
      where: { crop: Equal(cropId) },
    });

    return response.length > 0;
  }
}
