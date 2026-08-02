import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BaseOutboxRelayService } from '@app/common';

/**
 * Drains farms' own outbox to `tracing`. All the logic lives in
 * `BaseOutboxRelayService`; this class only supplies the wiring — which client,
 * which pause switch, how often.
 */
@Injectable()
export class OutboxRelayService extends BaseOutboxRelayService {
  protected readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    dataSource: DataSource,
    configService: ConfigService,
    @Inject('TRACING_SERVICE') tracingClient: ClientProxy,
  ) {
    super(dataSource, configService, tracingClient, 'OUTBOX_RELAY_ENABLED');
  }

  @Interval('farms-outbox-relay', 3000)
  async drain(): Promise<void> {
    return super.drain();
  }
}
