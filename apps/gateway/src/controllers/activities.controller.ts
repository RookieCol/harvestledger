import { AuthGuard, CreateActivityDto } from '@app/common';
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
import { ClientProxy } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('activities')
export class ActivitiesController {
  constructor(
    @Inject('FARMS_SERVICE') private readonly farmsService: ClientProxy,
  ) {}

  /*----------------------------ACTIVITIES---------------------------------------------*/
  @UseGuards(AuthGuard)
  @Get()
  async activitiesByCrop(@Query('cropId') cropId: number) {
    return this.farmsService.send({ cmd: 'activitiesByFarm' }, cropId);
  }
  @UseGuards(AuthGuard)
  @Post()
  async createActivity(@Body() createActvity: CreateActivityDto) {
    return this.farmsService.send({ cmd: 'activities' }, createActvity);
  }
  @UseGuards(AuthGuard)
  @Patch()
  async updateActivity(
    @Query('activityId') activityId: number,
    @Body() updateActivityDto: any,
  ) {
    return this.farmsService.send(
      { cmd: 'updateActivity' },
      { updateActivityDto, activityId },
    );
  }
  @UseGuards(AuthGuard)
  @Delete()
  async deleteActivity(@Query('activityId') activityId: number) {
    return this.farmsService.send({ cmd: 'deleteActivity' }, activityId);
  }

  @UseGuards(AuthGuard)
  @Post('photo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadActivityImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1048576 }),
          new FileTypeValidator({ fileType: 'image' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('activityId') activityId: number,
    @Request() req: any,
  ) {
    return this.farmsService.send(
      { cmd: 'activity-photo' },
      { file: file, userId: req.user.id, activityId: activityId },
    );
  }

  @UseGuards(AuthGuard)
  @Get('photo')
  async getActivityImage(
    @Query('activityId') activityId: number,
  ): Promise<any> {
    return this.farmsService.send({ cmd: 'get-activity-photo' }, activityId);
  }
}
