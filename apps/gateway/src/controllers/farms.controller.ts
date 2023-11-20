import { AuthGuard,  CreateFarmDto, UpdateFarmDto } from '@app/common';
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
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { ClientProxy, Payload } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('farms')
export class FarmsController {
  constructor(
    @Inject('FARMS_SERVICE') private readonly farmsService: ClientProxy,
  ) {}

  /* --------------------FARMS---------------------------------------------*/
  @UseGuards(AuthGuard)
  @Post()
  async createFarm(
    @Body() createFarmDto: CreateFarmDto,
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
    @Body() updateFarmDto: UpdateFarmDto,
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

  @UseGuards(AuthGuard)
  @Post('photo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFarmImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1048576 }),
          new FileTypeValidator({ fileType: 'image' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('farmId') farmId: number,
    @Request() req: any,
  ) {
    return this.farmsService.send(
      { cmd: 'farm-image' },
      { file: file, userId: req.user.id, farmId: farmId },
    );
  }

  @UseGuards(AuthGuard)
  @Get('photo')
  async getFarmImage(@Query('farmId') farmId: number): Promise<any> {
    return this.farmsService.send({ cmd: 'get-farm-image' }, farmId);
  }
}
