import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UpdateFarmDto } from '@app/common';
import { CreateFarmDto } from '@app/common/dtos/farms/createFarmDto.dto';
import { FarmsService } from './farms.service';

@Controller()
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}
  /*--------------------FARMS---------------------------------------------*/
  @MessagePattern({ cmd: 'farms' })
  async print(
    @Payload() payload: { userId: number; createFarmDto: CreateFarmDto },
  ) {
    return this.farmsService.createFarm(payload.userId, payload.createFarmDto);
  }
  @MessagePattern({ cmd: 'farmsByUser' })
  async printByUser(@Payload() userId: number) {
    return this.farmsService.findAllByUserId(userId);
  }
  @MessagePattern({ cmd: 'updateFarm' })
  async updateFarm(
    @Payload()
    {
      userId,
      updateFarmDto,
      farmId,
    }: {
      userId: number;
      updateFarmDto: UpdateFarmDto;
      farmId: number;
    },
  ) {
    return this.farmsService.updateFarm(userId, updateFarmDto, farmId);
  }

  @MessagePattern({ cmd: 'deleteFarm' })
  async deleteFarm(@Payload() payload: { userId: number; farmId: number }) {
    return this.farmsService.deleteFarm(payload.userId, payload.farmId);
  }

  @MessagePattern({ cmd: 'farm-image' })
  async uploadFarmImage(
    @Payload()
    payload: {
      farmId: number;
      userId: number;
      file: Express.Multer.File;
    },
  ) {
    return this.farmsService.uploadFarmImage(
      payload.file,
      payload.userId,
      payload.farmId,
    );
  }

  @MessagePattern({ cmd: 'get-farm-image' })
  async getFarmImage(@Payload() payload: { userId: number; farmId: number }) {
    return this.farmsService.getFarmImage(payload.userId, payload.farmId);
  }
}
