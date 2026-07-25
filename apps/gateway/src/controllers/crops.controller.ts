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
  ParseIntPipe,
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
  async createCrop(
    @Body() createCropDto: CreateCropDto,
    @Request() req: any,
  ): Promise<any> {
    return this.farmsService.send(
      { cmd: 'crops' },
      { userId: req.user.id, createCropDto },
    );
  }
  @UseGuards(AuthGuard)
  @Get()
  async getCropsByFarm(
    @Query('farmId', ParseIntPipe) farmId: number,
    @Request() req: any,
  ): Promise<any> {
    return this.farmsService.send(
      { cmd: 'cropsByFarm' },
      { userId: req.user.id, farmId },
    );
  }
  @UseGuards(AuthGuard)
  @Patch()
  async updateCrop(
    @Query('cropId', ParseIntPipe) cropId: number,
    @Body() updateCropDto: UpdateCropDto,
    @Request() req: any,
  ): Promise<any> {
    return this.farmsService.send(
      { cmd: 'updateCrop' },
      { userId: req.user.id, updateCropDto, cropId },
    );
  }

  @UseGuards(AuthGuard)
  @Get('findOne/:id')
  async getCropById(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ): Promise<any> {
    return this.farmsService.send(
      { cmd: 'getCropById' },
      { userId: req.user.id, id },
    );
  }

  @UseGuards(AuthGuard)
  @Delete()
  async deleteCrop(
    @Query('cropId', ParseIntPipe) cropId: number,
    @Request() req: any,
  ): Promise<any> {
    return this.farmsService.send(
      { cmd: 'deleteCrop' },
      { userId: req.user.id, cropId },
    );
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
    @Query('cropId', ParseIntPipe) cropId: number,
    @Request() req: any,
  ) {
    return this.farmsService.send(
      { cmd: 'crop-photo' },
      { file: file, userId: req.user.id, cropId: cropId },
    );
  }

  @UseGuards(AuthGuard)
  @Get('photo')
  async getCropPhoto(
    @Query('cropId', ParseIntPipe) cropId: number,
    @Request() req: any,
  ): Promise<any> {
    return this.farmsService.send(
      { cmd: 'get-crop-photo' },
      { userId: req.user.id, cropId },
    );
  }
}
