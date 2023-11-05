import { AuthGuard, CreateHarvestDto, FarmDto } from '@app/common';
import {
  Body,
  Controller,
  Get,
  Delete,
  Inject,
  Post,
  UseGuards,
  Request,
  Patch,
  Query,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Controller('harvests')
export class HarvestsController {
  constructor(
    @Inject('FARMS_SERVICE') private readonly farmsService: ClientProxy,
  ) {}

  /*-----------------------------HARVEST------------------------------------------------*/
  @UseGuards(AuthGuard)
  @Post()
  async createHarvest(@Body() createHarvestDto: CreateHarvestDto) {
    return this.farmsService.send({ cmd: 'harvest' }, createHarvestDto);
  }
  @UseGuards(AuthGuard)
  @Get()
  async harvestByCrop(@Query('cropId') cropId: number) {
    return this.farmsService.send({ cmd: 'harvestByCrop' }, cropId);
  }
  /* @UseGuards(AuthGuard) */
  @Patch()
  async updateHarvest(
    @Query('harvestId') harvestId: number,
    @Body() updateHarvestDto: any,
  ) {
    return this.farmsService.send(
      { cmd: 'updateHarvest' },
      { updateHarvestDto, harvestId },
    );
  }
  @UseGuards(AuthGuard)
  @Delete()
  async deleteHarvest(@Query('harvestId') harvestId: number) {
    return this.farmsService.send({ cmd: 'deleteHarvest' }, harvestId);
  }
}
