import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly mailerService: MailerService) {}

  public async welcomeEmail(email: string, name: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `Welcome to HarvestLedger, ${name}!`,
        html: `<b>Welcome ${name} to HarvestLedger</b>`,
      });

      this.logger.log(`Welcome email sent to ${email}`);
    } catch (err) {
      this.logger.error(`Failed to send welcome email to ${email}`, err.stack);
    }
  }

  public async forgotPasswordEmail(
    email: string,
    token: string,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `HarvestLedger - Reset Password`,
        html: `<b>Click <a href="${process.env.FRONTEND_URL}/home/resetpassword/${token}">here</a> to reset your password</b>`,
      });

      this.logger.log(`Forgot password email sent to ${email}`);
    } catch (err) {
      this.logger.error(
        `Failed to send forgot password email to ${email}`,
        err.stack,
      );
    }
  }
}
