import { Controller, Get, Inject, Post, Body } from '@nestjs/common'; // Agrega 'Body' a los imports
import { ClientProxy } from '@nestjs/microservices';
import { CreateUserDto } from '@app/common';

@Controller()
export class GatewayController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: ClientProxy,
  ) {}

  @Post('auth/register')
  async register(@Body() createUserDto: CreateUserDto): Promise<any> {
    console.log('Objeto CreateUserDto:', createUserDto);
    return this.authService.send({ cmd: 'register' }, createUserDto);
  }
}
