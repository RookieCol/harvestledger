import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { NotificationsController } from './notifications.controller';
import {
  AppLoggerModule,
  HealthModule,
  NotificationsModule as MailerNotificationsModule,
  RabbitmqModule,
} from '@app/common';

/**
 * Email delivery, split out of `auth` (Phase 5). It owns no database: every
 * input arrives as a RabbitMQ event, and the only side effect is an outbound
 * SMTP message — which is exactly why it can be a leaf service.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: './.env',
    }),
    RabbitmqModule,
    MailerNotificationsModule,
    HealthModule,
    AppLoggerModule,
  ],
  controllers: [NotificationsController],
})
export class NotificationsAppModule {}
