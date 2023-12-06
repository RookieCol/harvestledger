import { AuthGuard, CreateCropDto, UpdateCropDto } from '@app/common';
import {
  Body,
  Controller,
  Get,
  Delete,
  Param,
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
  async createCrop(@Body() createCropDto: CreateCropDto): Promise<any> {
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
    @Body() updateCropDto: UpdateCropDto,
  ): Promise<any> {
    return this.farmsService.send(
      { cmd: 'updateCrop' },
      { updateCropDto, cropId },
    );
  }

  @UseGuards(AuthGuard)
  @Get(':id')
  async getCropById(@Param('id') id: number): Promise<any> {
    return this.farmsService.send({ cmd: 'getCropById' }, id);
  }

  @UseGuards(AuthGuard)
  @Delete()
  async deleteCrop(@Query('cropId') cropId: number): Promise<any> {
    return this.farmsService.send({ cmd: 'deleteCrop' }, cropId);
  }

  @UseGuards(AuthGuard)
  @Post('photo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCropPhoto(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1048576 }),
          new FileTypeValidator({ fileType: 'image' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('cropId') cropId: number,
    @Request() req: any,
  ) {
    return this.farmsService.send(
      { cmd: 'crop-photo' },
      { file: file, userId: req.user.id, cropId: cropId },
    );
  }

  @UseGuards(AuthGuard)
  @Get('photo')
  async getCropPhoto(@Query('cropId') cropId: number): Promise<any> {
    return this.farmsService.send({ cmd: 'get-crop-photo' }, cropId);
  }
}
