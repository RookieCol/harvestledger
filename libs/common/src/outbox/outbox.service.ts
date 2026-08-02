import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OutboxEntity } from '../entities';

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
    const row = manager.create(OutboxEntity, { pattern, payload });
    await manager.save(row);
  }
}
