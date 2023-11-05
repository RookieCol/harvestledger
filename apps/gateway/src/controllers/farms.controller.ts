import { AuthGuard, FarmDto } from '@app/common';
import { Body, Controller, Get,Delete, Inject, Post, UseGuards,Request, Patch, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Controller('farms')
export class FarmsController {
  constructor(
    @Inject('FARMS_SERVICE') private readonly farmsService: ClientProxy 
  ) {}

   /* --------------------FARMS---------------------------------------------*/
   @UseGuards(AuthGuard)
   @Post()
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
   @Get()
   async getFarms(@Request() req: any): Promise<any> {
     console.log(req.user.id);
     return this.farmsService.send({ cmd: 'farmsByUser' }, req.user.id);
   }
 
   @UseGuards(AuthGuard)
   @Patch()
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
   @Delete()
   async deleteFarm(@Query('farmId') farmId: number): Promise<any> {
     return this.farmsService.send({ cmd: 'deleteFarm' }, farmId);
   }
}
