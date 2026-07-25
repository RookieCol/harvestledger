import { Controller, Inject } from '@nestjs/common';
import {
  CreateHarvestDto,
  RabbitmqService,
  UpdateHarvestDto,
} from '@app/common';
import {
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { HarvestService } from './harvests.service';

@Controller()
export class HarvestsController {
  constructor(
    private readonly harvestsService: HarvestService,
    @Inject('RabbitmqServiceInterface')
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  /*-----------------------------HARVESTS------------------------------------------------*/

  @MessagePattern({ cmd: 'harvest' })
  async createHarvest(
    @Ctx() context: RmqContext,
    @Payload() payload: { userId: number; createHarvestDto: CreateHarvestDto },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.harvestsService.createHarvest(
      payload.userId,
      payload.createHarvestDto,
    );
  }
  @MessagePattern({ cmd: 'harvestByCrop' })
  async harvestByCrop(
    @Ctx() context: RmqContext,
    @Payload() payload: { userId: number; cropId: number },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.harvestsService.findHarvestByCropId(
      payload.userId,
      payload.cropId,
    );
  }

  @MessagePattern({ cmd: 'updateHarvest' })
  async updateHarvest(
    @Ctx() context: RmqContext,
    @Payload()
    payload: {
      userId: number;
      updateHarvestDto: UpdateHarvestDto;
      harvestId: number;
    },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.harvestsService.updateHarvest(
      payload.userId,
      payload.updateHarvestDto,
      payload.harvestId,
    );
  }

  @MessagePattern({ cmd: 'deleteHarvest' })
  async deleteHarvest(
    @Ctx() context: RmqContext,
    @Payload() payload: { userId: number; harvestId: number },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.harvestsService.deleteHarvest(
      payload.userId,
      payload.harvestId,
    );
  }
  @MessagePattern({ cmd: 'harvest-photo' })
  async uploadFarmImage(
    @Ctx() context: RmqContext,
    @Payload()
    payload: { harvestId: number; userId: number; file: Express.Multer.File },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);

    return this.harvestsService.uploadHarvestImage(
      payload.file,
      payload.userId,
      payload.harvestId,
    );
  }

  @MessagePattern({ cmd: 'get-harvest-photo' })
  async getFarmImage(
    @Ctx() context: RmqContext,
    @Payload() payload: { userId: number; harvestId: number },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);

    return this.harvestsService.getHarvestImage(
      payload.userId,
      payload.harvestId,
    );
  }
}
