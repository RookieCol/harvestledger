import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';



@Injectable()
export class NotificationsService {
  constructor(private readonly mailerService: MailerService) {}
  
  public example(): void {
    this
      .mailerService
      .sendMail({
        to: 'juand.agudelom@gmail.com', 
        from: 'jagudelo@example.com', 
        subject: '✔', 
        text: 'welcome', 
        html: '<b>welcome</b>',
      })
      .then((success) => {
        console.log(success)
      })
      .catch((err) => {
        console.log(err)
      });
  }
}
  