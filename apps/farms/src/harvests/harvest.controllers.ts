import { Controller, Inject } from "@nestjs/common";
import { CreateActivityDto, CreateHarvestDto, RabbitmqService, UpdateHarvestDto } from "@app/common";
import { Ctx, MessagePattern, Payload, RmqContext } from "@nestjs/microservices";
import { HarvestService } from "./harvests.service";

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
    @Payload() createHarvestDto: CreateHarvestDto,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.harvestsService.createHarvest(createHarvestDto);
  }
  @MessagePattern({ cmd: 'harvestByCrop' })
  async harvestByCrop(@Ctx() context: RmqContext, @Payload() cropId: number) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.harvestsService.findHarvestByCropId(cropId);
  }

  @MessagePattern({ cmd: 'updateHarvest' })
  async updateHarvest(
    @Ctx() context: RmqContext,
    @Payload() updateHarvestDto: UpdateHarvestDto,
    harvestId: number,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.harvestsService.updateHarvest(updateHarvestDto, harvestId);
  }

  @MessagePattern({ cmd: 'deleteHarvest' })
  async deleteHarvest(
    @Ctx() context: RmqContext,
    @Payload() harvestId: number,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.harvestsService.deleteHarvest(harvestId);
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
    @Payload()
    payload: { harvestId: number },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);

    return this.harvestsService.getHarvestImage(payload.harvestId);
  }
}