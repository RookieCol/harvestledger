import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { MailerService } from '../services/mailer.service';

const resendProvider: Provider = {
  provide: 'RESEND_SERVICE',
  useFactory: (configService: ConfigService) => {
    const apiKey = configService.get<string>('RESEND_API_KEY');
    return new Resend(apiKey);
  },
  inject: [ConfigService],
};

@Module({
  controllers: [],
  providers: [resendProvider,MailerService],
  exports: [MailerService],
})
export class MailerModule {}
