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
 * FarmEntity.user is eager, so loading the `farm` relation already brings the
 * owning user with it. Each method throws:
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
    this.check(userId, farm.user?.id);
    return farm;
  }

  async assertCropOwner(userId: number, cropId: number): Promise<CropEntity> {
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId },
      // Load the owning user explicitly — the eager farm.user relation does not
      // load transitively through an explicit `relations` list.
      relations: ['farm', 'farm.user'],
    });
    if (!crop) {
      throw new NotFoundException('Crop not found');
    }
    this.check(userId, crop.farm?.user?.id);
    return crop;
  }

  async assertActivityOwner(
    userId: number,
    activityId: number,
  ): Promise<ActivitiesEntity> {
    const activity = await this.activitiesRepository.findOne({
      where: { id: activityId },
      relations: ['crop', 'crop.farm', 'crop.farm.user'],
    });
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    this.check(userId, activity.crop?.farm?.user?.id);
    return activity;
  }

  async assertHarvestOwner(
    userId: number,
    harvestId: number,
  ): Promise<HarvestEntity> {
    const harvest = await this.harvestsRepository.findOne({
      where: { id: harvestId },
      relations: ['crop', 'crop.farm', 'crop.farm.user'],
    });
    if (!harvest) {
      throw new NotFoundException('Harvest not found');
    }
    this.check(userId, harvest.crop?.farm?.user?.id);
    return harvest;
  }

  private check(userId: number, ownerId: number | undefined): void {
    if (ownerId === undefined || ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this resource');
    }
  }
}
