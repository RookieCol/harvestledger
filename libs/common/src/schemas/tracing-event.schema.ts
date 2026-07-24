import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TracingEventType =
  | 'CROP_INITIALIZED'
  | 'ACTIVITY_CREATED'
  | 'HARVEST_CREATED';

export type TracingEventDocument = HydratedDocument<TracingEvent>;

@Schema({ collection: 'tracing_events' })
export class TracingEvent {
  @Prop({ required: true })
  eventType: TracingEventType;

  @Prop({ required: true })
  cropId: number;

  @Prop({ required: true })
  farmId: number;

  @Prop({ required: true })
  userId: number;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ required: true })
  occurredAt: Date;
}

export const TracingEventSchema = SchemaFactory.createForClass(TracingEvent);
