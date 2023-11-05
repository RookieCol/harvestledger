import { AuthGuard, FarmDto } from '@app/common';
import { Body, Controller, Get,Delete, Inject, Post, UseGuards,Request, Patch, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Controller('crops')
export class CropsController {
  constructor(
    @Inject('FARMS_SERVICE') private readonly farmsService: ClientProxy,
  ) {}

  /*--------------------------------CROPS---------------------------------------------*/
  @UseGuards(AuthGuard)
  @Post()
  async createCrop(@Body() createCropDto: FarmDto): Promise<any> {
    return this.farmsService.send({ cmd: 'crops' }, createCropDto);
  }
  @UseGuards(AuthGuard)
  @Get()
  async getCropsByFarm(@Query('farmId') farmId: number): Promise<any> {
    return this.farmsService.send({ cmd: 'cropsByFarm' }, farmId);
  }
  @UseGuards(AuthGuard)
  @Patch()
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
  @Delete()
  async deleteCrop(@Query('cropId') cropId: number): Promise<any> {
    return this.farmsService.send({ cmd: 'deleteCrop' }, cropId);
  }
}
