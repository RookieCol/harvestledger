import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BaseOutboxRelayService } from '@app/common';

/**
 * Drains auth's own outbox (user.created / user.updated) to `farms`, which
 * keeps its local user_projection read model in sync. All the logic lives in
 * `BaseOutboxRelayService`; this class only supplies the wiring — which
 * client, which pause switch, how often.
 */
@Injectable()
export class AuthOutboxRelayService extends BaseOutboxRelayService {
  protected readonly logger = new Logger(AuthOutboxRelayService.name);

  constructor(
    dataSource: DataSource,
    configService: ConfigService,
    @Inject('FARMS_SERVICE') farmsClient: ClientProxy,
  ) {
    super(dataSource, configService, farmsClient, 'AUTH_OUTBOX_RELAY_ENABLED');
  }

  @Interval('auth-outbox-relay', 3000)
  async drain(): Promise<void> {
    return super.drain();
  }
}
