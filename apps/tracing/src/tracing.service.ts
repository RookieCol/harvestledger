import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TracingEvent,
  TracingEventDocument,
  TracingEventType,
  TracingEventPayloadDto,
} from '@app/common';

@Injectable()
export class TracingService {
  constructor(
    @InjectModel(TracingEvent.name)
    private readonly tracingEventModel: Model<TracingEventDocument>,
  ) {}

  async recordEvent(
    eventType: TracingEventType,
    data: TracingEventPayloadDto,
  ) {
    const event = new this.tracingEventModel({
      eventType,
      cropId: data.cropId,
      farmId: data.farmId,
      userId: data.userId,
      payload: data.payload,
      occurredAt: new Date(),
    });
    return event.save();
  }

  async getHistory(cropId: number) {
    return this.tracingEventModel
      .find({ cropId })
      .sort({ occurredAt: 1 })
      .exec();
  }
}
