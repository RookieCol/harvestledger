import { Controller, Inject, UseGuards } from '@nestjs/common';
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

  @MessagePattern({ cmd: 'refresh-token' })
  async refreshToken(@Ctx() context: RmqContext, @Payload() payload: any) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.authService.refreshToken(payload.refreshToken);
  }

  @MessagePattern({ cmd: 'update-user' })
  async updateUser(@Ctx() context: RmqContext, @Payload() payload: any) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.authService.updateUserInfo(payload.userId, payload.newInfo);
  }

  @MessagePattern({ cmd: 'user' })
  async getUser(@Ctx() context: RmqContext, @Payload() payload: any) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.authService.getUser(payload.userId);
  }


  @MessagePattern({ cmd: 'forgot-password' })
  async forgotPassword(@Ctx() context: RmqContext, @Payload() email: string) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.authService.forgotPassword(email);
  }




  @MessagePattern({ cmd: 'user-image' })
  async uploadUserImage(
    @Ctx() context: RmqContext,
    @Payload() payload: { userId: number; file: Express.Multer.File },
  ) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.authService.uploadUserImage(payload.file, payload.userId);
  }

  @MessagePattern({ cmd: 'get-user-image' })
  async getUserImage(@Ctx() context: RmqContext, @Payload() payload: any) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.authService.getUserImage(payload);
  }
}
