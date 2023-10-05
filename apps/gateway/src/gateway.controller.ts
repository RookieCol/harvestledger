import { Controller, Get, Inject, Post, Body, UseGuards, Request } from '@nestjs/common'; // Agrega 'Body' a los imports
import { ClientProxy } from '@nestjs/microservices';
import { AuthGuard, CreateUserDto, ExistingUserDto } from '@app/common';
import { FarmDto } from '@app/common/dto/farmsDto.dto';
import { request } from 'http';


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
  @Post('farms')
  async createFarm(@Body() createFarmDto: FarmDto,@Request() req: any): Promise<any> {
    return this.farmsService.send({ cmd: 'farms' }, {...createFarmDto, user: {id: req.user.id}});
  }
  @UseGuards(AuthGuard)
  @Get('farms')
  async getFarms(@Request() req: any): Promise<any> {
    return this.farmsService.send({ cmd: 'farmsByUser' }, req.user.id);
  }
}

