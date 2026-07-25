import { Controller } from '@nestjs/common';
import { CreateCropDto, UpdateCropDto } from '@app/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CropsService } from './crops.service';

@Controller()
export class CropsController {
  constructor(private readonly cropsService: CropsService) {}
  /*--------------------------------CROPS---------------------------------------------*/
  @MessagePattern({ cmd: 'crops' })
  async printCrops(
    @Payload() payload: { userId: number; createCropDto: CreateCropDto },
  ) {
    return this.cropsService.createCrop(payload.userId, payload.createCropDto);
  }

  @MessagePattern({ cmd: 'getCropById' })
  async getCropById(@Payload() payload: { userId: number; id: number }) {
    return this.cropsService.findCropById(payload.userId, payload.id);
  }

  @MessagePattern({ cmd: 'cropsByFarm' })
  async printCropsByFarm(
    @Payload() payload: { userId: number; farmId: number },
  ) {
    return this.cropsService.findCropsByFarmId(payload.userId, payload.farmId);
  }
  @MessagePattern({ cmd: 'updateCrop' })
  async updateCrop(
    @Payload()
    payload: {
      userId: number;
      updateCropDto: UpdateCropDto;
      cropId: number;
    },
  ) {
    return this.cropsService.updateCrop(
      payload.userId,
      payload.updateCropDto,
      payload.cropId,
    );
  }

  @MessagePattern({ cmd: 'deleteCrop' })
  async deleteCrop(@Payload() payload: { userId: number; cropId: number }) {
    return this.cropsService.deleteCrop(payload.userId, payload.cropId);
  }
  @MessagePattern({ cmd: 'crop-photo' })
  async uploadCropPhoto(
    @Payload()
    payload: {
      cropId: number;
      userId: number;
      file: Express.Multer.File;
    },
  ) {
    return this.cropsService.uploadCropPhoto(
      payload.file,
      payload.userId,
      payload.cropId,
    );
  }
  @MessagePattern({ cmd: 'get-crop-photo' })
  async getCropPhoto(@Payload() payload: { userId: number; cropId: number }) {
    return this.cropsService.getCropPhoto(payload.userId, payload.cropId);
  }
}
