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
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthGuard,
  CreateActivityDto,
  CreateHarvestDto,
  CreateUserDto,
  ExistingUserDto,
} from '@app/common';
import { FarmDto } from '@app/common/dto/farmsDto.dto';
import { UpdateUserDto } from '@app/common/dto/Users/updateUserDto.dto';
import { FileInterceptor } from '@nestjs/platform-express';

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

  @UseGuards(AuthGuard)
  @Post('profile/photo')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 19000 }),
          new FileTypeValidator({ fileType: 'image' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.authService.send(
      { cmd: 'user-image' },
      { file, userId: req.user.id },
    );
  }

  @UseGuards(AuthGuard)
  @Get('profile/photo')
  async getUserImage(@Request() req: any) {
    return this.authService.send({ cmd: 'get-user-image' }, req.user.id);
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
