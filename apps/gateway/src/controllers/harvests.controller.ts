import { AuthGuard, CreateHarvestDto, UpdateHarvestDto } from '@app/common';
import {
  Body,
  Controller,
  Get,
  Delete,
  Inject,
  Post,
  UseGuards,
  Patch,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('harvests')
export class HarvestsController {
  constructor(
    @Inject('FARMS_SERVICE') private readonly farmsService: ClientProxy,
  ) {}

  /*-----------------------------HARVEST------------------------------------------------*/
  @UseGuards(AuthGuard)
  @Post()
  async createHarvest(
    @Body() createHarvestDto: CreateHarvestDto,
    @Request() req: any,
  ) {
    return this.farmsService.send(
      { cmd: 'harvest' },
      { userId: req.user.id, createHarvestDto },
    );
  }
  @UseGuards(AuthGuard)
  @Get()
  async harvestByCrop(
    @Query('cropId', ParseIntPipe) cropId: number,
    @Request() req: any,
  ) {
    return this.farmsService.send(
      { cmd: 'harvestByCrop' },
      { userId: req.user.id, cropId },
    );
  }
  @UseGuards(AuthGuard)
  @Patch()
  async updateHarvest(
    @Query('harvestId', ParseIntPipe) harvestId: number,
    @Body() updateHarvestDto: UpdateHarvestDto,
    @Request() req: any,
  ) {
    return this.farmsService.send(
      { cmd: 'updateHarvest' },
      { userId: req.user.id, updateHarvestDto, harvestId },
    );
  }
  @UseGuards(AuthGuard)
  @Delete()
  async deleteHarvest(
    @Query('harvestId', ParseIntPipe) harvestId: number,
    @Request() req: any,
  ) {
    return this.farmsService.send(
      { cmd: 'deleteHarvest' },
      { userId: req.user.id, harvestId },
    );
  }
  @UseGuards(AuthGuard)
  @Post('photo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadHarvestPhoto(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1048576 }),
          new FileTypeValidator({ fileType: 'image' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('harvestId', ParseIntPipe) harvestId: number,
    @Request() req: any,
  ) {
    return this.farmsService.send(
      { cmd: 'harvest-photo' },
      { file: file, userId: req.user.id, harvestId: harvestId },
    );
  }

  @UseGuards(AuthGuard)
  @Get('photo')
  async getHarvestPhoto(
    @Query('harvestId', ParseIntPipe) harvestId: number,
    @Request() req: any,
  ): Promise<any> {
    return this.farmsService.send(
      { cmd: 'get-harvest-photo' },
      { userId: req.user.id, harvestId },
    );
  }
}
