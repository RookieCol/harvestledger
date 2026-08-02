import { Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { firstValueFrom } from 'rxjs';

const BATCH_SIZE = 20;

/**
 * Read side of the transactional outbox, shared by every service that owns one.
 *
 * Each service has its **own** `outbox` table in its **own** database — the
 * table is never shared. A subclass supplies the poll interval, the target
 * client and the config key that pauses it; the draining logic is here so
 * `auth` does not reimplement what `farms` already got right.
 *
 * Publishing is at-least-once (a crash between the publish and the mark
 * re-sends on the next tick), so consumers must be idempotent.
 */
export abstract class BaseOutboxRelayService {
  protected abstract readonly logger: Logger;
  // Guards against overlapping runs if a drain takes longer than the interval.
  private draining = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly targetClient: ClientProxy,
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

      for (const row of rows) {
        try {
          await firstValueFrom(
            this.targetClient.emit(row.pattern, row.payload),
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
