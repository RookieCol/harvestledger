import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { context, propagation } from '@opentelemetry/api';
import { OutboxEntity } from '../entities';

// Key under which the W3C trace context travels inside the stored payload.
// Underscore-prefixed so it reads as transport metadata, not domain data;
// the relay strips it before the event reaches a consumer's DTO.
export const TRACE_CARRIER_KEY = '_trace';

// Write side of the transactional outbox. `enqueue` MUST be called with the same
// EntityManager as the domain write, inside one transaction, so the event row
// and the domain row commit atomically.
@Injectable()
export class OutboxService {
  async enqueue(
    manager: EntityManager,
    pattern: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // Capture the trace context of the request that produced this event. The
    // outbox breaks the synchronous call chain — the relay publishes seconds
    // later, from a scheduler tick with no ambient context — so without
    // carrying it here, the consumer's work would start a brand-new trace and
    // "register a user" would show up as two unrelated traces instead of one.
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);

    const row = manager.create(OutboxEntity, {
      pattern,
      payload: Object.keys(carrier).length
        ? { ...payload, [TRACE_CARRIER_KEY]: carrier }
        : payload,
    });
    await manager.save(row);
  }
}
