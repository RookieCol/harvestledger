import { ActivitiesEntity, CreateActivityDto } from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Equal, Repository } from 'typeorm';
import { OwnershipService } from '../ownership/ownership.service';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(ActivitiesEntity)
    private activitiesRepository: Repository<ActivitiesEntity>,
    private s3Service: S3Service,
    private readonly ownership: OwnershipService,
    @Inject('TRACING_SERVICE') private readonly tracingClient: ClientProxy,
  ) {}
  /*----------------------------ACTIVITIES---------------------------------------------*/
  async createActivity(userId: number, createActivityDto: CreateActivityDto) {
    const { cropId, ...activityData } = createActivityDto;
    // The activity is created under a crop — that crop must belong to the user.
    const crop = await this.ownership.assertCropOwner(userId, cropId);

    const newActivity = this.activitiesRepository.create({
      ...activityData,
      crop: { id: cropId },
    });
    const savedActivity = await this.activitiesRepository.save(newActivity);

    this.tracingClient.emit('activity.created', {
      cropId,
      farmId: crop.farm?.id,
      userId: crop.farm?.user?.id,
      payload: savedActivity,
    });

    return {
      data: savedActivity,
      message: 'Created activity and update tracing successfully',
      status: 'success',
    };
  }

  async findActivitiesByCropId(
    userId: number,
    cropId: number,
  ): Promise<{ data: ActivitiesEntity[]; message: string; status: string }> {
    await this.ownership.assertCropOwner(userId, cropId);
    const activities = await this.activitiesRepository.find({
      where: { crop: Equal(cropId) },
    });
    return {
      data: activities,
      message: 'Activities retrieved successfully',
      status: 'success',
    };
  }

  async updateActivity(
    userId: number,
    updateActivityDto: any,
    activityId: number,
  ) {
    const activity = await this.ownership.assertActivityOwner(
      userId,
      activityId,
    );

    Object.assign(activity, updateActivityDto);
    await this.activitiesRepository.save(activity);
    return {
      data: activity,
      message: 'Activity updated successfully',
      status: 'success',
    };
  }

  async deleteActivity(
    userId: number,
    activityId: number,
  ): Promise<{ data: any; message: string; status: string }> {
    const activity = await this.ownership.assertActivityOwner(
      userId,
      activityId,
    );

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
    const activity = await this.ownership.assertActivityOwner(
      userId,
      activityId,
    );

    const url = await this.s3Service.uploadFile(
      file,
      `activity-${activityId}-user-${userId}`,
    );
    activity.photo = url.key;
    await this.activitiesRepository.save(activity);
    return {
      data: url.key,
      message: 'Activity image uploaded successfully',
      status: 'success',
    };
  }

  async getActivityPhoto(userId: number, activityId: number) {
    const activity = await this.ownership.assertActivityOwner(
      userId,
      activityId,
    );

    if (!activity.photo) {
      throw new NotFoundException('Activity photo not found');
    }

    const imageData = await this.s3Service.getFile(activity.photo);

    return { message: 'ok', data: imageData };
  }
}
