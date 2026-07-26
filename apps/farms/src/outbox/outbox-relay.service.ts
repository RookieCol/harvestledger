import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { firstValueFrom } from 'rxjs';

const BATCH_SIZE = 20;
const POLL_MS = 3000;

// Read side of the transactional outbox. Every few seconds it claims a batch of
// unpublished rows and dispatches them to RabbitMQ, out-of-band from the request
// that produced them. Publishing may be at-least-once (a crash between publish
// and mark re-sends on the next tick); the tracing consumer is idempotent, so
// that is safe.
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  // Guards against overlapping runs if a drain takes longer than the interval.
  private draining = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Inject('TRACING_SERVICE') private readonly tracingClient: ClientProxy,
  ) {}

  @Interval('outbox-relay', POLL_MS)
  async drain(): Promise<void> {
    // Operational switch: flip to "false" to simulate a publisher outage — rows
    // pile up durably instead of being lost, and drain once it is back on.
    if (this.configService.get('OUTBOX_RELAY_ENABLED') === 'false') return;
    if (this.draining) return;
    this.draining = true;
    try {
      await this.drainOnce();
    } catch (err) {
      this.logger.error(`outbox drain failed: ${err?.message ?? err}`);
    } finally {
      this.draining = false;
    }
  }

  private async drainOnce(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // FOR UPDATE SKIP LOCKED lets multiple farms replicas drain concurrently
      // without ever grabbing the same row.
      const rows: Array<{
        id: number;
        pattern: string;
        payload: Record<string, unknown>;
      }> = await manager.query(
        `SELECT id, pattern, payload FROM outbox
         WHERE "publishedAt" IS NULL
         ORDER BY id
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [BATCH_SIZE],
      );

      for (const row of rows) {
        try {
          await firstValueFrom(
            this.tracingClient.emit(row.pattern, row.payload),
          );
          await manager.query(
            `UPDATE outbox SET "publishedAt" = now() WHERE id = $1`,
            [row.id],
          );
        } catch (err) {
          // Leave it pending; retry next tick. Bump attempts for visibility.
          await manager.query(
            `UPDATE outbox SET attempts = attempts + 1 WHERE id = $1`,
            [row.id],
          );
          this.logger.warn(
            `outbox row ${row.id} (${row.pattern}) publish failed: ${
              err?.message ?? err
            }`,
          );
        }
      }

      if (rows.length) {
        this.logger.log(`outbox drained ${rows.length} event(s)`);
      }
    });
  }
}
