import { Controller, Inject } from '@nestjs/common';
import {
  EventPattern,
  MessagePattern,
  Ctx,
  RmqContext,
  Payload,
} from '@nestjs/microservices';

import { TracingService } from './tracing.service';
import { RabbitmqService, TracingEventPayloadDto } from '@app/common';

@Controller()
export class TracingController {
  constructor(
    @Inject('TracingServiceInterface')
    private readonly tracingService: TracingService,
    @Inject('RabbitmqServiceInterface')
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  @EventPattern('crop.initialized')
  async handleCropInitialized(
    @Ctx() context: RmqContext,
    @Payload() data: TracingEventPayloadDto,
  ) {
    await this.tracingService.recordEvent('CROP_INITIALIZED', data);
    this.rabbitmqService.acknowledgeMessage(context);
  }

  @EventPattern('activity.created')
  async handleActivityCreated(
    @Ctx() context: RmqContext,
    @Payload() data: TracingEventPayloadDto,
  ) {
    await this.tracingService.recordEvent('ACTIVITY_CREATED', data);
    this.rabbitmqService.acknowledgeMessage(context);
  }

  @EventPattern('harvest.created')
  async handleHarvestCreated(
    @Ctx() context: RmqContext,
    @Payload() data: TracingEventPayloadDto,
  ) {
    await this.tracingService.recordEvent('HARVEST_CREATED', data);
    this.rabbitmqService.acknowledgeMessage(context);
  }

  @MessagePattern({ cmd: 'getTracingHistory' })
  async getTracingHistory(
    @Ctx() context: RmqContext,
    @Payload() cropId: number,
  ) {
    const history = await this.tracingService.getHistory(cropId);
    this.rabbitmqService.acknowledgeMessage(context);
    return history;
  }
}
