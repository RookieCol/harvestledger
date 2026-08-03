import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
// import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { NotificationsService } from '../services/notifications.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // MAIL_SERVICE is a nodemailer shorthand ("gmail", …). It is blank in
        // most setups, and passing an empty string makes nodemailer look up a
        // service by that name and fail — so only send it when it has a value.
        const service = configService.get<string>('MAIL_SERVICE');
        // Env vars are strings; nodemailer wants a real number/boolean here.
        const asBool = (value?: string) => value === 'true';
        const user = configService.get<string>('MAIL_USER');
        const pass = configService.get<string>('MAIL_PASS');

        return {
          transport: {
            ...(service ? { service } : {}),
            host: configService.get<string>('MAIL_HOST'),
            port: Number(configService.get<string>('MAIL_PORT')),
            secure: asBool(configService.get<string>('MAIL_SECURE')),
            ignoreTLS: asBool(configService.get<string>('MAIL_IGNORE_TLS')),
            // An unauthenticated sink (Mailpit, MailHog) rejects an empty-password
            // AUTH handshake; omit auth entirely when there is no password.
            ...(pass ? { auth: { user, pass } } : {}),
          },

          defaults: {
            from: user,
          },
          /*
        template: {
          dir: process.cwd() + '/templates/',
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
        */
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
