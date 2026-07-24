import { ActivitiesEntity, CreateActivityDto, CropEntity } from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Equal, Repository } from 'typeorm';

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    @InjectRepository(ActivitiesEntity)
    private activitiesRepository: Repository<ActivitiesEntity>,
    @InjectRepository(CropEntity)
    private cropsRepository: Repository<CropEntity>,
    private s3Service: S3Service,
    @Inject('TRACING_SERVICE') private readonly tracingClient: ClientProxy,
  ) {}
  /*----------------------------ACTIVITIES---------------------------------------------*/
  async createActivity(createActivityDto: CreateActivityDto) {
    const newActivity = this.activitiesRepository.create(createActivityDto);
    const savedActivity = await this.activitiesRepository.save(newActivity);

    const cropFinding = await this.findCropById(newActivity.crop.id);
    const crop = cropFinding.data;
    this.tracingClient.emit('activity.created', {
      cropId: crop?.id,
      farmId: crop?.farm?.id,
      userId: crop?.farm?.user?.id,
      payload: savedActivity,
    });

    return {
      data: savedActivity,
      message: 'Created activity and update tracing successfully',
      status: 'success',
    };
  }

  async findActivitiesByCropId(
    cropId: number,
  ): Promise<{ data: ActivitiesEntity[]; message: string; status: string }> {
    const activities = await this.activitiesRepository.find({
      where: { crop: Equal(cropId) },
    });
    return {
      data: activities,
      message: 'Activities retrieved successfully',
      status: 'success',
    };
  }

  async updateActivity(updateActivityDto: any, activityId: number) {
    const activity = await this.activitiesRepository.findOne({
      where: { id: activityId },
    });

    if (!activity) {
      return {
        data: null,
        message: 'Activity not found',
        status: 'error',
      };
    }

    try {
      Object.assign(activity, updateActivityDto);
      await this.activitiesRepository.save(activity);
      return {
        data: activity,
        message: 'Activity updated successfully',
        status: 'success',
      };
    } catch (error) {
      this.logger.error('Error updating Activity', error);
      return {
        data: null,
        message: 'An error occurred while updating the Activity',
        status: 'error',
      };
    }
  }

  async deleteActivity(
    activityId: number,
  ): Promise<{ data: any; message: string; status: string }> {
    const activity = await this.activitiesRepository.find({
      where: { id: Equal(activityId) },
    });

    if (activity.length === 0) {
      return {
        data: activity,
        message: 'Activity not found',
        status: 'error',
      };
    }

    const deletedActivity = await this.activitiesRepository.remove(activity);

    return {
      data: deletedActivity,
      message: 'Activity deleted successfully',
      status: 'success',
    };
  }

  async uploadActivityPhoto(
    file: Express.Multer.File,
    userId: number,
    activityId: number,
  ) {
    const url = await this.s3Service.uploadFile(
      file,
      `activity-${activityId}-user-${userId}`,
    );
    const activity = await this.activitiesRepository.findOne({
      where: { id: activityId },
    });
    if (!activity) {
      throw new NotFoundException('Harvest not found');
    }
    activity.photo = url.key;
    await this.activitiesRepository.save(activity);
    return {
      data: url.key,
      message: 'Activity image uploaded successfully',
      status: 'success',
    };
  }

  async getActivityPhoto(activityId: number) {
    const activity = await this.activitiesRepository.findOne({
      where: { id: activityId },
    });

    if (!activity.photo || activity.photo === null) {
      return { message: 'Activity photo not found', status: 'error' };
    }

    const imageData = await this.s3Service.getFile(activity.photo);

    return { message: 'ok', data: imageData };
  }

  // Find a Crop by ID (with its farm and the farm's owning user) for the tracing event
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
