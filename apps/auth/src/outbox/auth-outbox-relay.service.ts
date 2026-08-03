import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BaseOutboxRelayService } from '@app/common';

/**
 * Drains auth's own outbox. All the logic lives in `BaseOutboxRelayService`;
 * this class supplies the wiring — the routing table, the pause switch, the
 * interval.
 *
 * `user.created` fans out to two services with different jobs and no
 * knowledge of each other: `farms` upserts its local user_projection read
 * model, `notifications` sends the welcome email. Adding a third consumer is
 * a line in this table, not a change to auth's domain code.
 */
@Injectable()
export class AuthOutboxRelayService extends BaseOutboxRelayService {
  protected readonly logger = new Logger(AuthOutboxRelayService.name);

  constructor(
    dataSource: DataSource,
    configService: ConfigService,
    @Inject('FARMS_SERVICE') farmsClient: ClientProxy,
    @Inject('NOTIFICATIONS_SERVICE') notificationsClient: ClientProxy,
  ) {
    super(
      dataSource,
      configService,
      {
        'user.created': [farmsClient, notificationsClient],
        'user.updated': [farmsClient],
        'user.password_reset_requested': [notificationsClient],
      },
      'AUTH_OUTBOX_RELAY_ENABLED',
    );
  }

  @Interval('auth-outbox-relay', 3000)
  async drain(): Promise<void> {
    return super.drain();
  }
}
