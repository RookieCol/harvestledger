import { Controller, Inject } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';

import { TracingService } from './tracing.service';
import { TracingEventPayloadDto } from '@app/common';

// Acking is handled globally by RmqReliabilityInterceptor (ack after processing;
// events nack-to-DLQ on error). Handlers just do the work and throw on failure.
@Controller()
export class TracingController {
  constructor(
    @Inject('TracingServiceInterface')
    private readonly tracingService: TracingService,
  ) {}

  @EventPattern('crop.initialized')
  async handleCropInitialized(@Payload() data: TracingEventPayloadDto) {
    await this.tracingService.recordEvent('CROP_INITIALIZED', data);
  }

  @EventPattern('activity.created')
  async handleActivityCreated(@Payload() data: TracingEventPayloadDto) {
    await this.tracingService.recordEvent('ACTIVITY_CREATED', data);
  }

  @EventPattern('harvest.created')
  async handleHarvestCreated(@Payload() data: TracingEventPayloadDto) {
    await this.tracingService.recordEvent('HARVEST_CREATED', data);
  }

  @MessagePattern({ cmd: 'getTracingHistory' })
  async getTracingHistory(@Payload() cropId: number) {
    return this.tracingService.getHistory(cropId);
  }
}
