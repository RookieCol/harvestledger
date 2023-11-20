import { Controller, Inject } from '@nestjs/common';
import { CreateCropDto, RabbitmqService, UpdateCropDto } from '@app/common';
import { Ctx, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { CropsService } from './crops.service';

@Controller()
export class CropsController {
  constructor(
    private readonly cropsService: CropsService,
    @Inject('RabbitmqServiceInterface')
    private readonly rabbitmqService: RabbitmqService,
  ) {}
  /*--------------------------------CROPS---------------------------------------------*/
  @MessagePattern({ cmd: 'crops' })
  async printCrops(
    @Ctx() context: RmqContext,
    @Payload() createCropDto: CreateCropDto,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.cropsService.createCrop(createCropDto);
  }
  @MessagePattern({ cmd: 'cropsByFarm' })
  async printCropsByFarm(
    @Ctx() context: RmqContext,
    @Payload() farmId: number,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.cropsService.findCropsByFarmId(farmId);
  }
  @MessagePattern({ cmd: 'updateCrop' })
  async updateCrop(
    @Ctx() context: RmqContext,
    @Payload() updateCropDto: UpdateCropDto,
    cropId: number,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.cropsService.updateCrop(updateCropDto, cropId);
  }

  @MessagePattern({ cmd: 'deleteCrop' })
  async deleteCrop(@Ctx() context: RmqContext, @Payload() cropId: number) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.cropsService.deleteCrop(cropId);
  }
  @MessagePattern({ cmd: 'crop-photo' })
  async uploadCropPhoto(
    @Ctx() context: RmqContext,
    @Payload()
    payload: { cropId: number; userId: number; file: Express.Multer.File },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);

    return this.cropsService.uploadCropPhoto(
      payload.file,
      payload.userId,
      payload.cropId,
    );
  }
  @MessagePattern({ cmd: 'get-crop-photo' })
  async getCropPhoto(
    @Ctx() context: RmqContext,
    @Payload()
    payload: { cropId: number },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);

    return this.cropsService.getCropPhoto(payload.cropId);
  }

}
