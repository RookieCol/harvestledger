import { Controller, Inject, UploadedFile } from '@nestjs/common';
import { MessagePattern, Ctx, RmqContext, Payload } from '@nestjs/microservices';

import { TracingService } from './tracing.service';
import { RabbitmqService, InitTracingDto } from '@app/common'

@Controller()
export class TracingController {
  constructor(
    @Inject('TracingServiceInterface')
    private readonly tracingService: TracingService,
    @Inject('RabbitmqServiceInterface')
    private readonly rabbitmqService: RabbitmqService,
  ) {
  }
  
  @MessagePattern({ cmd: 'gethello' })
  async getHello(@Ctx() context: RmqContext ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.tracingService.getHello();
  }

  @MessagePattern({ cmd: 'initTracing' })
  async initTracing(@Ctx() context: RmqContext, @Payload() dataTracing: InitTracingDto) {    
    this.rabbitmqService.acknowledgeMessage(context);
    return this.tracingService.initTracing(dataTracing);
  }

  @MessagePattern({ cmd: 'updateTracing' })
  async updateTracing(
    @Ctx() context: RmqContext,
    @Payload() data: {id: number; path: string},
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.tracingService.updateTracing(data.id, data.path);
  }

}
