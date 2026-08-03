import { Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { context, propagation } from '@opentelemetry/api';
import { TRACE_CARRIER_KEY } from './outbox.service';

const BATCH_SIZE = 20;

/**
 * Where a drained event is published. Either a single client (every event goes
 * there — the farms -> tracing case) or a per-pattern routing table, which is
 * what fan-out needs: `user.created` has to reach both `farms` (read model)
 * and `notifications` (welcome email), and neither knows about the other.
 */
export type OutboxTargets = ClientProxy | Record<string, ClientProxy[]>;

/**
 * Read side of the transactional outbox, shared by every service that owns one.
 *
 * Each service has its **own** `outbox` table in its **own** database — the
 * table is never shared. A subclass supplies the poll interval, the target
 * client(s) and the config key that pauses it; the draining logic is here so
 * `auth` does not reimplement what `farms` already got right.
 *
 * Publishing is at-least-once (a crash between the publish and the mark
 * re-sends on the next tick), so consumers must be idempotent. With fan-out
 * that also means a partial failure re-sends to *every* target, not just the
 * one that failed.
 */
export abstract class BaseOutboxRelayService {
  protected abstract readonly logger: Logger;
  // Guards against overlapping runs if a drain takes longer than the interval.
  private draining = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly targets: OutboxTargets,
    private readonly enabledConfigKey: string,
  ) {}

  async drain(): Promise<void> {
    // Operational switch: flip to "false" to simulate a publisher outage — rows
    // pile up durably instead of being lost, and drain once it is back on.
    if (this.configService.get(this.enabledConfigKey) === 'false') return;
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

  private clientsFor(pattern: string): ClientProxy[] {
    if (typeof (this.targets as ClientProxy).emit === 'function') {
      return [this.targets as ClientProxy];
    }
    return (this.targets as Record<string, ClientProxy[]>)[pattern] ?? [];
  }

  private async drainOnce(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // FOR UPDATE SKIP LOCKED lets multiple replicas drain concurrently
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

      let published = 0;

      for (const row of rows) {
        const clients = this.clientsFor(row.pattern);
        if (!clients.length) {
          // A pattern with nowhere to go is a wiring bug, not a transient
          // failure. Leave the row pending — losing it silently would be
          // worse — and say so loudly enough to be noticed.
          this.logger.error(
            `outbox row ${row.id}: no target registered for pattern "${row.pattern}" — left pending`,
          );
          continue;
        }

        // Restore the producing request's trace context so the publish (and
        // everything the consumer does with it) hangs off the original trace
        // instead of starting an orphan.
        const { [TRACE_CARRIER_KEY]: carrier, ...payload } = row.payload;
        const ctx = carrier
          ? propagation.extract(context.active(), carrier)
          : context.active();

        try {
          await context.with(ctx, async () => {
            for (const client of clients) {
              await firstValueFrom(client.emit(row.pattern, payload));
            }
          });
          await manager.query(
            `UPDATE outbox SET "publishedAt" = now() WHERE id = $1`,
            [row.id],
          );
          published++;
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

      if (published) {
        this.logger.log(`outbox drained ${published} event(s)`);
      }
    });
  }
}
