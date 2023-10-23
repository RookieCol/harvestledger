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
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthGuard,
  CreateActivityDto,
  CreateHarvestDto,
  CreateUserDto,
  ExistingUserDto,
  UserEntity,
} from '@app/common';
import { FarmDto } from '@app/common/dto/farmsDto.dto';
import { UpdateUserDto } from '@app/common/dto/Users/updateUserDto.dto';

@Controller()
export class GatewayController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: ClientProxy,
    @Inject('FARMS_SERVICE') private readonly farmsService: ClientProxy,
  ) {}



  /* --------------------AUTH---------------------------------------------*/
  @Post('auth/register')
  async register(@Body() createUserDto: CreateUserDto): Promise<any> {
    return this.authService.send({ cmd: 'register' }, createUserDto);
  }

  @Post('auth/login')
  async login(@Body() existingUser: ExistingUserDto): Promise<any> {
    return this.authService.send({ cmd: 'login' }, existingUser);
  }

 @UseGuards(AuthGuard) 
  @Post('auth/update')
  async updateUser(
    @Request() req: any,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<any> {
    return this.authService.send(
      { cmd: 'update-user' },
      { userId: req.user.id, newInfo: updateUserDto },
    );
  }

  @UseGuards(AuthGuard)
  @Get('auth/user')
  async getUser(@Request() req: any): Promise<any> {
    return this.authService.send({ cmd: 'user' }, { userId: req.user.id });
  }

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
  /* @UseGuards(AuthGuard) */
  @Post('harvest')
  async createHarvest(@Body() createHarvestDto: CreateHarvestDto) {
    return this.farmsService.send({ cmd: 'harvest' }, createHarvestDto);
  }
}
