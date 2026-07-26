import { Allow } from 'class-validator';

// Internal event payload emitted by `farms` and consumed by `tracing`. The
// fields carry already-trusted data; @Allow() keeps them from being stripped by
// the whitelisting ValidationPipe without imposing validation on them.
export class TracingEventPayloadDto {
  @Allow()
  cropId: number;

  @Allow()
  farmId: number;

  @Allow()
  userId: number;

  @Allow()
  payload: Record<string, unknown>;
}
