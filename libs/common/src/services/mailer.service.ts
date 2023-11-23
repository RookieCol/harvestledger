import { Inject } from "@nestjs/common";
import { Resend } from "resend";



export class MailerService {
    constructor(
      @Inject('RESEND_SERVICE') private readonly resend: Resend,
    ) {}
  
    async sendEmail(email: string, subject: string, html: string) {
      return this.resend.emails.send({
        from: 'onboarding@resend.dev', 
        to: email,
        subject: subject,
        html: html,
      });
    }
  }
  