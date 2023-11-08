import { AuthGuard, FarmDto } from '@app/common';
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
  MaxFileSizeValidator,
  ParseFilePipe,
  FileTypeValidator,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';

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

  @UseGuards(AuthGuard)
  @Post('photo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCropImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 19000 }),
          new FileTypeValidator({ fileType: 'image' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('cropId') cropId: number,
    @Request() req: any,
  ) {
    return this.farmsService.send(
      { cmd: 'crop-image' },
      { file: file, userId: req.user.id, cropId: cropId },
    );
  }

  @UseGuards(AuthGuard)
  @Get('photo')
  async getCropImage(@Query('cropId') cropId: number): Promise<any> {
    return this.farmsService.send({ cmd: 'get-crop-image' }, cropId);
  }
}
