import { Controller, Get, Inject } from '@nestjs/common';

import {
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { CreateActivityDto, FarmEntity, RabbitmqService } from '@app/common';
import { FarmDto } from '@app/common/dto/farmsDto.dto';
import { FarmsService } from './farms.service';

@Controller()
export class FarmsController {
  constructor(
    private readonly farmsService: FarmsService,
    @Inject('RabbitmqServiceInterface')
    private readonly rabbitmqService: RabbitmqService,
  ) {}
  /*--------------------FARMS---------------------------------------------*/
  @MessagePattern({ cmd: 'farms' })
  async print(@Ctx() context: RmqContext, @Payload() createFarmDto: FarmDto) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.createFarm(createFarmDto);
  }
  @MessagePattern({ cmd: 'farmsByUser' })
  async printByUser(@Ctx() context: RmqContext, @Payload() userId: number) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.findAllByUserId(userId);
  }

  @MessagePattern({ cmd: 'deleteFarm' })
  async deleteFarm(@Ctx() context: RmqContext, @Payload() farmId: number) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.deleteFarm(farmId);
  }
  /*--------------------------------CROPS---------------------------------------------*/
  @MessagePattern({ cmd: 'crops' })
  async printCrops(
    @Ctx() context: RmqContext,
    @Payload() createFarmDto: FarmDto,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.createCrop(createFarmDto);
  }
  @MessagePattern({ cmd: 'cropsByFarm' })
  async printCropsByFarm(
    @Ctx() context: RmqContext,
    @Payload() farmId: number,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.findCropsByFarmId(farmId);
  }

  /*----------------------------ACTIVITIES---------------------------------------------*/
  @MessagePattern({ cmd: 'activities' })
  async createActvities(
    @Ctx() context: RmqContext,
    @Payload() createActivity: CreateActivityDto,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.createActivity(createActivity);
  }
  @MessagePattern({ cmd: 'activitiesByFarm' })
  async activitiesByFarm(
    @Ctx() context: RmqContext,
    @Payload() cropId: number,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.findActivitiesByCropId(cropId);
  }

  /*-----------------------------HARVESTS------------------------------------------------*/

  @MessagePattern({ cmd: 'harvest' })
  async createHarvest(
    @Ctx() context: RmqContext,
    @Payload() createActivity: CreateActivityDto,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.createHarvest(createActivity);
  }
  @MessagePattern({ cmd: 'harvestByCrop' })
  async harvestByCrop(@Ctx() context: RmqContext, @Payload() cropId: number) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.findHarvestByCropId(cropId);
  }

  @MessagePattern({ cmd: 'deleteHarvest' })
  async deleteHarvest(
    @Ctx() context: RmqContext,
    @Payload() harvestId: number,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.deleteHarvest(harvestId);
  }
}
