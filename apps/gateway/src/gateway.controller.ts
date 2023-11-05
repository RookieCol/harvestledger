import {
  Controller,
  Get,
  Inject,
  Post,
  Body,
  UseGuards,
  Request,
  Query,
  Delete,
  Patch,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthGuard,
  CreateActivityDto,
  CreateHarvestDto,
} from '@app/common';
import { FarmDto } from '@app/common/dto/farmsDto.dto';


@Controller()
export class GatewayController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: ClientProxy,
    @Inject('FARMS_SERVICE') private readonly farmsService: ClientProxy,
  ) {}

  
  /*----------------------------ACTIVITIES---------------------------------------------*/
  @UseGuards(AuthGuard)
  @Post('activities')
  async createActivity(@Body() createActvity: CreateActivityDto) {
    return this.farmsService.send({ cmd: 'activities' }, createActvity);
  }
  @UseGuards(AuthGuard)
  @Get('activities')
  async activitiesByCrop(@Query('cropId') cropId: number) {
    return this.farmsService.send({ cmd: 'activitiesByFarm' }, cropId);
  }

  /*-----------------------------HARVEST------------------------------------------------*/
  @UseGuards(AuthGuard)
  @Post('harvest')
  async createHarvest(@Body() createHarvestDto: CreateHarvestDto) {
    return this.farmsService.send({ cmd: 'harvest' }, createHarvestDto);
  }
  @UseGuards(AuthGuard)
  @Get('harvest')
  async harvestByCrop(@Query('cropId') cropId: number) {
    return this.farmsService.send({ cmd: 'harvestByCrop' }, cropId);
  }
  /* @UseGuards(AuthGuard) */
  @Patch('harvest')
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
  @Delete('harvest')
  async deleteHarvest(@Query('harvestId') harvestId: number) {
    return this.farmsService.send({ cmd: 'deleteHarvest' }, harvestId);
  }
}
