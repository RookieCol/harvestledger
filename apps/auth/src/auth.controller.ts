import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import {
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { CreateUserDto, ExistingUserDto, RabbitmqService } from '@app/common';
import { AuthService } from './auth.service';
import { JwtGuard } from './guards/jwt.guard';

@Controller()
export class AuthController {
  constructor(
    @Inject('AuthServiceInterface')
    private readonly authService: AuthService,
    @Inject('RabbitmqServiceInterface')
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  @MessagePattern({ cmd: 'register' })
  async register(
    @Ctx() context: RmqContext,
    @Payload() newUser: CreateUserDto,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);

    return this.authService.register(newUser);
  }
  @MessagePattern({ cmd: 'login' })
  async login(
    @Ctx() context: RmqContext,
    @Payload() existingUser: ExistingUserDto,
  ) {
    this.rabbitmqService.acknowledgeMessage(context);

    return this.authService.login(existingUser);
  }

  @MessagePattern({ cmd: 'verify-jwt' })
  @UseGuards(JwtGuard)
  async verifyJwt(
    @Ctx() context: RmqContext,
    @Payload() payload: { jwt: string },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.authService.verifyJwt(payload.jwt);
  }
}
