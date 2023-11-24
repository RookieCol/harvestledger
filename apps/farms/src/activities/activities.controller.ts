import { Controller, Inject } from '@nestjs/common';
import { CreateActivityDto, RabbitmqService } from '@app/common';
import {
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { ActivitiesService } from './activities.service';

@Controller()
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    @Inject('RabbitmqServiceInterface')
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  /*----------------------------ACTIVITIES---------------------------------------------*/
  @MessagePattern({ cmd: 'activities' })
  async createActvities(
    @Ctx() context: RmqContext,
    @Payload() createActivity: CreateActivityDto,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.activitiesService.createActivity(createActivity);
  }
  @MessagePattern({ cmd: 'activitiesByFarm' })
  async activitiesByFarm(
    @Ctx() context: RmqContext,
    @Payload() cropId: number,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.activitiesService.findActivitiesByCropId(cropId);
  }
  @MessagePattern({ cmd: 'deleteActivity' })
  async deleteActivity(
    @Ctx() context: RmqContext,
    @Payload() activityId: number,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.activitiesService.deleteActivity(activityId);
  }
  @MessagePattern({ cmd: 'activity-photo' })
  async uploadCropImage(
    @Ctx() context: RmqContext,
    @Payload()
    payload: { activityId: number; userId: number; file: Express.Multer.File },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);

    return this.activitiesService.uploadActivityPhoto(
      payload.file,
      payload.userId,
      payload.activityId,
    );
  }
  @MessagePattern({ cmd: 'get-activity-photo' })
  async getCropImage(
    @Ctx() context: RmqContext,
    @Payload() activityId: number,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);

    return this.activitiesService.getActivityPhoto(activityId);
  }
}
