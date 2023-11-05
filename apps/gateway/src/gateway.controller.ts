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

  

  /* --------------------FARMS---------------------------------------------*/
  @UseGuards(AuthGuard)
  @Post('farms')
  async createFarm(
    @Body() createFarmDto: FarmDto,
    @Request() req: any,
  ): Promise<any> {
    return this.farmsService.send(
      { cmd: 'farms' },
      { ...createFarmDto, user: { id: req.user.id } },
    );
  }
  @UseGuards(AuthGuard)
  @Get('farms')
  async getFarms(@Request() req: any): Promise<any> {
    console.log(req.user.id);
    return this.farmsService.send({ cmd: 'farmsByUser' }, req.user.id);
  }

  @UseGuards(AuthGuard)
  @Patch('farms')
  async updateFarm(
    @Query('farmId') farmId: number,
    @Body() updateFarmDto: any,
  ): Promise<any> {
    return this.farmsService.send(
      { cmd: 'updateFarm' },
      { updateFarmDto, farmId },
    );
  }

  @UseGuards(AuthGuard)
  @Delete('farms')
  async deleteFarm(@Query('farmId') farmId: number): Promise<any> {
    return this.farmsService.send({ cmd: 'deleteFarm' }, farmId);
  }
  /*--------------------------------CROPS---------------------------------------------*/
  @UseGuards(AuthGuard)
  @Post('crops')
  async createCrop(@Body() createCropDto: FarmDto): Promise<any> {
    return this.farmsService.send({ cmd: 'crops' }, createCropDto);
  }
  @UseGuards(AuthGuard)
  @Get('crops')
  async getCropsByFarm(@Query('farmId') farmId: number): Promise<any> {
    return this.farmsService.send({ cmd: 'cropsByFarm' }, farmId);
  }
  @UseGuards(AuthGuard)
  @Patch('crops')
  async updateCrop(
    @Query('cropId') cropId: number,
    @Body() updateCropDto: any,
  ): Promise<any> {
    return this.farmsService.send(
      { cmd: 'updateCrop' },
      { updateCropDto, cropId },
    );
  }

  @UseGuards(AuthGuard)
  @Delete('crops')
  async deleteCrop(@Query('cropId') cropId: number): Promise<any> {
    return this.farmsService.send({ cmd: 'deleteCrop' }, cropId);
  }

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
