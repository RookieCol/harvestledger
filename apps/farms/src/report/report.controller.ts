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

  @MessagePattern({ cmd: 'getAdminReport' })
  async getAdminReport(@Ctx() context: RmqContext, @Payload() req_id: number) {
    this.rabbitmqService.acknowledgeMessage(context);
    return this.reportService.generateAdminReport(req_id);
  }

  @MessagePattern({ cmd: 'getFarmerReport' })
  async getFarmerReport(@Ctx() context: RmqContext, @Payload() payload: {id: number; req_id: number}) {    
    this.rabbitmqService.acknowledgeMessage(context);
    return this.reportService.generateFarmerReport(payload.id, payload.req_id);
  }
}