import { Controller } from '@nestjs/common';
import { CreateHarvestDto, UpdateHarvestDto } from '@app/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { HarvestService } from './harvests.service';

@Controller()
export class HarvestsController {
  constructor(private readonly harvestsService: HarvestService) {}

  /*-----------------------------HARVESTS------------------------------------------------*/

  @MessagePattern({ cmd: 'harvest' })
  async createHarvest(
    @Payload() payload: { userId: number; createHarvestDto: CreateHarvestDto },
  ) {
    return this.harvestsService.createHarvest(
      payload.userId,
      payload.createHarvestDto,
    );
  }
  @MessagePattern({ cmd: 'harvestByCrop' })
  async harvestByCrop(@Payload() payload: { userId: number; cropId: number }) {
    return this.harvestsService.findHarvestByCropId(
      payload.userId,
      payload.cropId,
    );
  }

  @MessagePattern({ cmd: 'updateHarvest' })
  async updateHarvest(
    @Payload()
    payload: {
      userId: number;
      updateHarvestDto: UpdateHarvestDto;
      harvestId: number;
    },
  ) {
    return this.harvestsService.updateHarvest(
      payload.userId,
      payload.updateHarvestDto,
      payload.harvestId,
    );
  }

  @MessagePattern({ cmd: 'deleteHarvest' })
  async deleteHarvest(
    @Payload() payload: { userId: number; harvestId: number },
  ) {
    return this.harvestsService.deleteHarvest(
      payload.userId,
      payload.harvestId,
    );
  }
  @MessagePattern({ cmd: 'harvest-photo' })
  async uploadFarmImage(
    @Payload()
    payload: {
      harvestId: number;
      userId: number;
      file: Express.Multer.File;
    },
  ) {
    return this.harvestsService.uploadHarvestImage(
      payload.file,
      payload.userId,
      payload.harvestId,
    );
  }

  @MessagePattern({ cmd: 'get-harvest-photo' })
  async getFarmImage(
    @Payload() payload: { userId: number; harvestId: number },
  ) {
    return this.harvestsService.getHarvestImage(
      payload.userId,
      payload.harvestId,
    );
  }
}
