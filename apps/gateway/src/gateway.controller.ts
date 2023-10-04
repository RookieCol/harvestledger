import { Controller, Get, Inject, Post, Body, UseGuards } from '@nestjs/common'; // Agrega 'Body' a los imports
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard, CreateUserDto, ExistingUserDto } from '@app/common';
import { FarmDto } from '@app/common/dto/farmsDto.dto';


@Controller()
export class GatewayController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: ClientProxy,
    @Inject('FARMS_SERVICE') private readonly farmsService: ClientProxy,
  ) {}

  @Post('auth/register')
  async register(@Body() createUserDto: CreateUserDto): Promise<any> {
    return this.authService.send({ cmd: 'register' }, createUserDto);
  }

  @Post('auth/login')
  async login(@Body() existingUser: ExistingUserDto): Promise<any> {
    return this.authService.send({ cmd: 'login' }, existingUser);
  }

  @UseGuards(AuthGuard)
  @Post('farms/create')
  async createFarm(@Body() createFarmDto: FarmDto): Promise<any> {
    return this.farmsService.send({ cmd: 'farms' }, createFarmDto);
  }
}
