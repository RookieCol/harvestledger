export class TracingEventPayloadDto {
  cropId: number;
  farmId: number;
  userId: number;
  payload: Record<string, unknown>;
}
