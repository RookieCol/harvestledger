import { ActivitiesEntity, CreateActivityDto } from '@app/common';
import { S3Service } from '@app/common/services/s3.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository } from 'typeorm';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(ActivitiesEntity)
    private activitiesRepository: Repository<ActivitiesEntity>,
    private s3Service: S3Service,
  ) {}
  /*----------------------------ACTIVITIES---------------------------------------------*/
  async createActivity(createActivityDto: CreateActivityDto) {
    const newActivity = this.activitiesRepository.create(createActivityDto);
    const savedActivity = await this.activitiesRepository.save(newActivity);
    return {
      data: savedActivity,
      message: 'Created activity successfully',
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

  /*   async updateActivity(updateActivityDto: any, activityId: number) {
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
      Object.assign(activity, updateActivityDto.updateActivityDto);
      await this.activitiesRepository.save(activity);
      return {
        data: activity,
        message: 'Activity updated successfully',
        status: 'success',
      };
    } catch (error) {
      console.error('Error updating Activity:', error);
      return {
        data: null,
        message: 'An error occurred while updating the Activity',
        status: 'error',
      };
    }
  }
 */
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
}
