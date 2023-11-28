import { AuthGuard, CreateUserDto, ExistingUserDto } from '@app/common';
import { UpdateUserDto } from '@app/common/dtos/users/updateUserDto.dto';
import {
  Body,
  Get,
  Controller,
  FileTypeValidator,
  Inject,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Request,
} from '@nestjs/common';

import { ClientProxy } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: ClientProxy,
  ) {}

  /* --------------------AUTH---------------------------------------------*/
  @Post('register')
  async register(@Body() createUserDto: CreateUserDto): Promise<any> {
    return this.authService.send({ cmd: 'register' }, createUserDto);
  }

  @Post('login')
  async login(@Body() existingUser: ExistingUserDto): Promise<any> {
    return this.authService.send({ cmd: 'login' }, existingUser);
  }

  @Post('refresh')
  async refresh(@Body() refreshToken: string): Promise<any> {
    return this.authService.send({ cmd: 'refresh-token' }, refreshToken);
  }

  @Post('forgotpassword')
  async forgotpassword(@Body() email: string): Promise<any> {
    return this.authService.send({ cmd: 'forgot-password' }, email);
  }

  @UseGuards(AuthGuard)
  @Post('update')
  async updateUser(
    @Request() req: any,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<any> {
    return this.authService.send(
      { cmd: 'update-user' },
      { userId: req.user.id, newInfo: updateUserDto },
    );
  }

  @Post('forgot-password')
  async forgotPassword(@Body() email: string): Promise<any> {
    return this.authService.send({ cmd: 'forgot-password' }, email);
  }




  @UseGuards(AuthGuard)
  @Get('user')
  async getUser(@Request() req: any): Promise<any> {
    return this.authService.send({ cmd: 'user' }, { userId: req.user.id });
  }

  @UseGuards(AuthGuard)
  @Post('profile/photo')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1048576 }),
          new FileTypeValidator({ fileType: 'image' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.authService.send(
      { cmd: 'user-image' },
      { file, userId: req.user.id },
    );
  }

  @UseGuards(AuthGuard)
  @Get('profile/photo')
  async getUserImage(@Request() req: any) {
    return this.authService.send({ cmd: 'get-user-image' }, req.user.id);
  }
}
