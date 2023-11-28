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
  Put,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Param
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthGuard,
  CreateActivityDto,
  CreateHarvestDto,
  CreateUserDto,
  ExistingUserDto,
  InitTracingDto,
} from '@app/common';
import { FarmDto } from '@app/common/dto/farmsDto.dto';
import { UpdateUserDto } from '@app/common/dto/Users/updateUserDto.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as multer from 'multer';

@Controller()
export class GatewayController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: ClientProxy,
    @Inject('FARMS_SERVICE') private readonly farmsService: ClientProxy,
    @Inject('TRACING_SERVICE') private readonly tracingService: ClientProxy,
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

  @UseGuards(AuthGuard)
  @Get('crop/:id')
  async getCropById(@Param('id') id: number): Promise<any> {
    return this.farmsService.send({ cmd: 'getCropId' }, id);
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

  /*---------------------TRACING----------------------------------------------------------- */
  @Get('tracing/getHello')
  async getHello() {
    return this.tracingService.send({ cmd: 'gethello' }, {});
  }

  @UseGuards(AuthGuard)
  @Post('tracing/updateTracing/:id')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({ destination: 'uploads' }),
    }),
  )
  async updateTracing(
    @Param('id') id: number,
    @UploadedFile() image: Express.Multer.File,
  ) {
    // console.log('id:', id);
    // console.log('image', image);
    const path = image.path;
    return this.tracingService.send({ cmd: 'updateTracing'}, {id, path});
  }


  @UseGuards(AuthGuard)
  @Put('tracing/initTracing')
  async initTracing(@Body() dataTracing: InitTracingDto): Promise<any> {
    // const response = await this.tracingService.send({ cmd: 'initTracing' }, dataTracing);
    // // Es recomendable manejar los errores con HttpException, se averiguará como funciona más tarde.
    // if (response.error) {
    //   throw new Error("Existe un error, intente más tarde");
    // }
    // return response.result;
    return this.tracingService.send({ cmd: 'initTracing' }, dataTracing);
  }

}
