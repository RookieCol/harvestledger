import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Transactional outbox. A domain write (crop/activity/harvest) and the event it
// should emit are persisted together in one local transaction, so they commit
// atomically. A relay then publishes pending rows to RabbitMQ out-of-band — the
// event can no longer be lost because the DB committed but the publish didn't.
@Entity('outbox')
export class OutboxEntity {
  @PrimaryGeneratedColumn()
  id: number;

  // The RabbitMQ event pattern, e.g. 'crop.initialized'.
  @Column()
  pattern: string;

  // The event body, exactly as it will be emitted.
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  // NULL while pending; set to the publish time once the relay dispatches it.
  // Indexed (partial) so the relay's "find pending" poll stays cheap.
  @Index('IDX_outbox_pending', { where: '"publishedAt" IS NULL' })
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  // Publish attempts — bumped on each failed dispatch, for observability.
  @Column({ type: 'int', default: 0 })
  attempts: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
