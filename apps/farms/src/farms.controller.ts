import { Controller, Get } from '@nestjs/common';
import { FarmsService } from './farms.service';

@Controller()
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Get()
  getHello(): string {
    return this.farmsService.getHello();
  }
}
