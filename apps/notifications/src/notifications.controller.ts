import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  NotificationsService,
  PasswordResetRequestedDto,
  UserProjectionEventDto,
} from '@app/common';

/**
 * Every email the system sends, in one place. These handlers are the only
 * consumers of the mailer now — `auth` used to send inline, which meant a slow
 * or broken SMTP host was felt on the registration request itself.
 *
 * Acking is handled globally by RmqReliabilityInterceptor: ack after
 * processing, retry with backoff, then dead-letter. Delivery is at-least-once,
 * so a redelivery can send the same email twice — an acceptable trade for
 * never silently dropping one. (Deduplicating would need an idempotency key
 * per message; not worth it for a welcome email.)
 */
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @EventPattern('user.created')
  async handleUserCreated(@Payload() data: UserProjectionEventDto) {
    await this.notificationsService.welcomeEmail(
      data.email,
      `${data.firstName} ${data.lastName ?? ''}`.trim(),
    );
  }

  @EventPattern('user.password_reset_requested')
  async handlePasswordResetRequested(
    @Payload() data: PasswordResetRequestedDto,
  ) {
    await this.notificationsService.forgotPasswordEmail(data.email, data.token);
  }
}
