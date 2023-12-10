import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Ctx, RmqContext, Payload } from '@nestjs/microservices';

import { ReportService } from './report.service';
import { RabbitmqService } from '@app/common';

@Controller()
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    @Inject('RabbitmqServiceInterface')
    private readonly rabbitmqService: RabbitmqService,
  ){}

  @MessagePattern({ cmd: 'getFarmerReport' })
  async getFarmerReport(@Ctx() context: RmqContext, @Payload() id: number) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.reportService.generateFarmerReport(id);
  }
}