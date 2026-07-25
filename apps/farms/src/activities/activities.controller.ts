import { Controller } from '@nestjs/common';
import { CreateActivityDto } from '@app/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ActivitiesService } from './activities.service';

@Controller()
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  /*----------------------------ACTIVITIES---------------------------------------------*/
  @MessagePattern({ cmd: 'activities' })
  async createActvities(
    @Payload()
    payload: {
      userId: number;
      createActivityDto: CreateActivityDto;
    },
  ) {
    return this.activitiesService.createActivity(
      payload.userId,
      payload.createActivityDto,
    );
  }
  @MessagePattern({ cmd: 'activitiesByFarm' })
  async activitiesByFarm(
    @Payload() payload: { userId: number; cropId: number },
  ) {
    return this.activitiesService.findActivitiesByCropId(
      payload.userId,
      payload.cropId,
    );
  }
  @MessagePattern({ cmd: 'updateActivity' })
  async updateActivity(
    @Payload()
    payload: {
      userId: number;
      updateActivityDto: any;
      activityId: number;
    },
  ) {
    return this.activitiesService.updateActivity(
      payload.userId,
      payload.updateActivityDto,
      payload.activityId,
    );
  }
  @MessagePattern({ cmd: 'deleteActivity' })
  async deleteActivity(
    @Payload() payload: { userId: number; activityId: number },
  ) {
    return this.activitiesService.deleteActivity(
      payload.userId,
      payload.activityId,
    );
  }
  @MessagePattern({ cmd: 'activity-photo' })
  async uploadCropImage(
    @Payload()
    payload: {
      activityId: number;
      userId: number;
      file: Express.Multer.File;
    },
  ) {
    return this.activitiesService.uploadActivityPhoto(
      payload.file,
      payload.userId,
      payload.activityId,
    );
  }
  @MessagePattern({ cmd: 'get-activity-photo' })
  async getCropImage(
    @Payload() payload: { userId: number; activityId: number },
  ) {
    return this.activitiesService.getActivityPhoto(
      payload.userId,
      payload.activityId,
    );
  }
}
