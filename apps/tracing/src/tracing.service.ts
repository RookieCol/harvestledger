import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RedisService,
  TracingEvent,
  TracingEventDocument,
  TracingEventType,
  TracingEventPayloadDto,
} from '@app/common';

// How long the idempotency marker lives — comfortably longer than any redelivery
// / retry window, bounded anyway by one key per (eventType, entity).
const IDEM_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class TracingService {
  constructor(
    @InjectModel(TracingEvent.name)
    private readonly tracingEventModel: Model<TracingEventDocument>,
    private readonly redisService: RedisService,
  ) {}

  async recordEvent(eventType: TracingEventType, data: TracingEventPayloadDto) {
    const entityId = (data.payload as { id?: number })?.id;
    const idemKey = `idem:tracing:${eventType}:${entityId}`;

    // Process-once: the first delivery claims the key; a redelivery finds it set
    // and skips. Claim BEFORE the write, and roll the claim back if the write
    // fails, so a failure doesn't permanently swallow the event.
    const firstTime = await this.redisService.setIfAbsent(
      idemKey,
      '1',
      IDEM_TTL_SECONDS,
    );
    if (!firstTime) {
      return { deduped: true };
    }

    try {
      const event = new this.tracingEventModel({
        eventType,
        cropId: data.cropId,
        farmId: data.farmId,
        userId: data.userId,
        payload: data.payload,
        occurredAt: new Date(),
      });
      return await event.save();
    } catch (err) {
      await this.redisService.del(idemKey);
      throw err;
    }
  }

  async getHistory(cropId: number) {
    return this.tracingEventModel
      .find({ cropId })
      .sort({ occurredAt: 1 })
      .exec();
  }
}
