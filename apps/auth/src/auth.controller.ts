import { Controller, Inject, UseGuards } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CreateUserDto, ExistingUserDto } from '@app/common';
import { AuthService } from './auth.service';
import { JwtGuard } from './guards/jwt.guard';
import { ResetPasswordDto } from '@app/common/dtos/auth';

// Acking handled globally by RmqReliabilityInterceptor.
@Controller()
export class AuthController {
  constructor(
    @Inject('AuthServiceInterface')
    private readonly authService: AuthService,
  ) {}

  @MessagePattern({ cmd: 'register' })
  async register(@Payload() newUser: CreateUserDto) {
    return this.authService.register(newUser);
  }
  @MessagePattern({ cmd: 'login' })
  async login(@Payload() existingUser: ExistingUserDto) {
    return this.authService.login(existingUser);
  }

  @MessagePattern({ cmd: 'verify-jwt' })
  @UseGuards(JwtGuard)
  async verifyJwt(@Payload() payload: { jwt: string }) {
    return this.authService.verifyJwt(payload.jwt);
  }

  @MessagePattern({ cmd: 'refresh-token' })
  async refreshToken(@Payload() payload: any) {
    return this.authService.refreshToken(payload.refreshToken);
  }

  @MessagePattern({ cmd: 'update-user' })
  async updateUser(@Payload() payload: any) {
    return this.authService.updateUserInfo(payload.userId, payload.newInfo);
  }

  @MessagePattern({ cmd: 'user' })
  async getUser(@Payload() payload: any) {
    return this.authService.getUser(payload.userId);
  }

  @MessagePattern({ cmd: 'forgot-password' })
  async forgotPassword(@Payload() payload: { email: string }) {
    return this.authService.forgotPassword(payload.email);
  }

  @MessagePattern({ cmd: 'reset-password' })
  async resetPassword(@Payload() payload: ResetPasswordDto) {
    return this.authService.resetPassword(payload.token, payload.newPassword);
  }

  @MessagePattern({ cmd: 'user-image' })
  async uploadUserImage(
    @Payload() payload: { userId: number; file: Express.Multer.File },
  ) {
    return this.authService.uploadUserImage(payload.file, payload.userId);
  }

  @MessagePattern({ cmd: 'get-user-image' })
  async getUserImage(@Payload() payload: any) {
    return this.authService.getUserImage(payload);
  }
}
