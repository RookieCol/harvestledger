import { AuthGuard } from '@app/common';
import { Controller, Get, Param, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Controller('tracing')
export class TracingController {
  constructor(
    @Inject('TRACING_SERVICE') private readonly tracingService: ClientProxy,
  ) {}

  /*---------------------TRACING----------------------------------------------------------- */
  @UseGuards(AuthGuard)
  @Get('history/:cropId')
  async getHistory(@Param('cropId') cropId: number): Promise<any> {
    return this.tracingService.send({ cmd: 'getTracingHistory' }, cropId);
  }
}
