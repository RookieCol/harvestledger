import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly mailerService: MailerService) {}

  public async welcomeEmail(email: string, name: string): Promise<void> {
    await this.send(
      {
        to: email,
        subject: `Welcome to HarvestLedger, ${name}!`,
        html: `<b>Welcome ${name} to HarvestLedger</b>`,
      },
      `welcome email to ${email}`,
    );
  }

  public async forgotPasswordEmail(
    email: string,
    token: string,
  ): Promise<void> {
    await this.send(
      {
        to: email,
        subject: `HarvestLedger - Reset Password`,
        html: `<b>Click <a href="${process.env.FRONTEND_URL}/home/resetpassword/${token}">here</a> to reset your password</b>`,
      },
      `forgot password email to ${email}`,
    );
  }

  /**
   * Sends and lets failures propagate. This used to swallow them, which meant
   * a misconfigured SMTP host looked exactly like a working one — the bug that
   * hid a broken transport for as long as it existed. Now that mailing is a
   * service of its own, a throw is the useful outcome: the RabbitMQ
   * reliability interceptor retries with backoff and then dead-letters, so a
   * failed email is visible and replayable instead of gone.
   */
  private async send(
    message: Parameters<MailerService['sendMail']>[0],
    description: string,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail(message);
      this.logger.log(`Sent ${description}`);
    } catch (err) {
      this.logger.error(`Failed to send ${description}: ${err?.message}`);
      throw err;
    }
  }
}
