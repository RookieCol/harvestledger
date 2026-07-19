import {
  AuthGuard,
  CreateCropDto,
  UpdateCropDto,
  InitTracingDto,
} from '@app/common';
import {
  Body,
  Controller,
  Get,
  Put,
  Param,
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
import { diskStorage } from 'multer';
import * as multer from 'multer';

@Controller('tracing')
export class TracingController {
  constructor(
    @Inject('TRACING_SERVICE') private readonly tracingService: ClientProxy,
  ) {}

  /*---------------------TRACING----------------------------------------------------------- */
  @Get('getHello')
  async getHello() {
    return this.tracingService.send({ cmd: 'gethello' }, {});
  }

  @UseGuards(AuthGuard)
  @Put('initTracing')
  async initTracing(@Body() dataTracing: InitTracingDto): Promise<any> {
    return this.tracingService.send({ cmd: 'initTracing' }, dataTracing);
  }
  @UseGuards(AuthGuard)
  @Post('updateTracing/:id')
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
    return this.tracingService.send({ cmd: 'updateTracing' }, { id, path });
  }

  // @UseGuards(AuthGuard)
  // @Put('tracing/initTracing')
  // async initTracing(@Body() dataTracing: InitTracingDto): Promise<any> {
  //   // const response = await this.tracingService.send({ cmd: 'initTracing' }, dataTracing);
  //   // // Es recomendable manejar los errores con HttpException, se averiguará como funciona más tarde.
  //   // if (response.error) {
  //   //   throw new Error("Existe un error, intente más tarde");
  //   // }
  //   // return response.result;
  //   return this.tracingService.send({ cmd: 'initTracing' }, dataTracing);
  // }
}
