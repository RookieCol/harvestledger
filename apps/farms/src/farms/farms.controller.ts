import { Controller, Inject } from '@nestjs/common';

import {
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { RabbitmqService, UpdateFarmDto } from '@app/common';
import { CreateFarmDto } from '@app/common/dtos/farms/createFarmDto.dto';
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
  async print(
    @Ctx() context: RmqContext,
    @Payload() createFarmDto: CreateFarmDto,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.createFarm(createFarmDto);
  }
  @MessagePattern({ cmd: 'farmsByUser' })
  async printByUser(@Ctx() context: RmqContext, @Payload() userId: number) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.findAllByUserId(userId);
  }
  @MessagePattern({ cmd: 'updateFarm' })
  async updateFarm(
    @Ctx() context: RmqContext,
    @Payload()
    {
      userId,
      updateFarmDto,
      farmId,
    }: { userId: number; updateFarmDto: UpdateFarmDto; farmId: number },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.updateFarm(userId, updateFarmDto, farmId);
  }

  @MessagePattern({ cmd: 'deleteFarm' })
  async deleteFarm(
    @Ctx() context: RmqContext,
    @Payload() payload: { userId: number; farmId: number },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.deleteFarm(payload.userId, payload.farmId);
  }

  @MessagePattern({ cmd: 'farm-image' })
  async uploadFarmImage(
    @Ctx() context: RmqContext,
    @Payload()
    payload: { farmId: number; userId: number; file: Express.Multer.File },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);

    return this.farmsService.uploadFarmImage(
      payload.file,
      payload.userId,
      payload.farmId,
    );
  }

  @MessagePattern({ cmd: 'get-farm-image' })
  async getFarmImage(
    @Ctx() context: RmqContext,
    @Payload() payload: { userId: number; farmId: number },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.farmsService.getFarmImage(payload.userId, payload.farmId);
  }
}
