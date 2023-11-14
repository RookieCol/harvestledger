import { Controller, Get, Inject } from '@nestjs/common';
import { MessagePattern, Ctx, RmqContext, Payload } from '@nestjs/microservices';

import { TracingService } from './tracing.service';
import { RabbitmqService, InitTracingDto } from '@app/common'

@Controller()
export class TracingController {
  constructor(
    private readonly tracingService: TracingService,
    @Inject('RabbitmqServiceInterface')
    private readonly rabbitmqService: RabbitmqService,
  ) {
    console.log('controller tracing iniciado')
  }
  
  @MessagePattern({ cmd: 'gethello' })
  async getHello(@Ctx() context: RmqContext ) {
    console.log(context)
    this.rabbitmqService.acknowledgeMessage(context);
    return this.tracingService.getHello();
  }

  @MessagePattern({ cmd: 'initTracing' })
  async initTracing(@Ctx() context: RmqContext, @Payload() initTracingDto: InitTracingDto) {
    console.log(initTracingDto);
    this.rabbitmqService.acknowledgeMessage(context);
    return this.tracingService.initTracing(initTracingDto);
  }

  // @MessagePattern({ cmd: 'updateCrop' })
  // async updateCrop(
  //   @Ctx() context: RmqContext,
  //   @Payload() updateCropDto: any,
  //   cropId: number,
  // ) {
  //   this.rabbitmqService.acknowledgeMessage(context);
  //   return this.farmsService.updateCrop(updateCropDto, cropId);
  // }
}
