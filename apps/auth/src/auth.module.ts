import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { RabbitmqModule, RabbitmqService } from '@app/common';
import { AuthService } from './auth.service';

@Module({
  imports: [
    RabbitmqModule
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: 'RabbitmqServiceInterface',
      useClass: RabbitmqService,
    }
  ],
})
export class AuthModule {}
