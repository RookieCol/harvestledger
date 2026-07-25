import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { ReportService } from './report.service';

@Controller()
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @MessagePattern({ cmd: 'getAdminReport' })
  async getAdminReport(@Payload() req_id: number) {
    return this.reportService.generateAdminReport(req_id);
  }

  @MessagePattern({ cmd: 'getFarmerReport' })
  async getFarmerReport(@Payload() payload: { id: number; req_id: number }) {
    return this.reportService.generateFarmerReport(payload.id, payload.req_id);
  }
}
