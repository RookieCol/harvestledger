import {
  ActivitiesEntity,
  CropEntity,
  FarmEntity,
  HarvestEntity,
} from '@app/common';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/**
 * Resolves and enforces the ownership chain
 *   User ──< Farm ──< Crop ──< Activity / Harvest
 * so a user can only touch resources that ultimately belong to them.
 *
 * `FarmEntity.userId` is a plain scalar column (not a relation — `users`
 * lives in a different database), so no join to user data is ever needed
 * here. Each method throws:
 *  - NotFoundException  when the resource does not exist, and
 *  - ForbiddenException when it exists but belongs to a different user
 * (deliberately distinct: a missing resource is a 404, someone else's is a 403).
 */
@Injectable()
export class OwnershipService {
  constructor(
    @InjectRepository(FarmEntity)
    private readonly farmsRepository: Repository<FarmEntity>,
    @InjectRepository(CropEntity)
    private readonly cropsRepository: Repository<CropEntity>,
    @InjectRepository(ActivitiesEntity)
    private readonly activitiesRepository: Repository<ActivitiesEntity>,
    @InjectRepository(HarvestEntity)
    private readonly harvestsRepository: Repository<HarvestEntity>,
  ) {}

  async assertFarmOwner(userId: number, farmId: number): Promise<FarmEntity> {
    const farm = await this.farmsRepository.findOne({ where: { id: farmId } });
    if (!farm) {
      throw new NotFoundException('Farm not found');
    }
    this.check(userId, farm.userId);
    return farm;
  }

  async assertCropOwner(userId: number, cropId: number): Promise<CropEntity> {
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId },
      relations: ['farm'],
    });
    if (!crop) {
      throw new NotFoundException('Crop not found');
    }
    this.check(userId, crop.farm?.userId);
    return crop;
  }

  async assertActivityOwner(
    userId: number,
    activityId: number,
  ): Promise<ActivitiesEntity> {
    const activity = await this.activitiesRepository.findOne({
      where: { id: activityId },
      relations: ['crop', 'crop.farm'],
    });
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    this.check(userId, activity.crop?.farm?.userId);
    return activity;
  }

  async assertHarvestOwner(
    userId: number,
    harvestId: number,
  ): Promise<HarvestEntity> {
    const harvest = await this.harvestsRepository.findOne({
      where: { id: harvestId },
      relations: ['crop', 'crop.farm'],
    });
    if (!harvest) {
      throw new NotFoundException('Harvest not found');
    }
    this.check(userId, harvest.crop?.farm?.userId);
    return harvest;
  }

  private check(userId: number, ownerId: number | undefined): void {
    if (ownerId === undefined || ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this resource');
    }
  }
}
