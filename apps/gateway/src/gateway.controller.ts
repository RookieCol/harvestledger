import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';


@Controller()
export class GatewayController {

  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: ClientProxy,
  ) {}

  @Get('hello-world')
  async Hello(): Promise<any> {
    return this.authService.send({ cmd: 'hello-world' }, {});
  }




}
