import { Controller, Get, Inject } from '@nestjs/common';

import {
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { FarmEntity, RabbitmqService } from '@app/common';
import { FarmDto } from '@app/common/dto/farmsDto.dto';
import { FarmsService } from './farms.service';

@Controller()
export class FarmsController {
  constructor(
    private readonly farmsService: FarmsService,
    @Inject('RabbitmqServiceInterface')
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  @MessagePattern({ cmd: 'farms' })
  async print(
    @Ctx() context: RmqContext,
    @Payload() createFarmDto: FarmDto,
  ){
    // Elimina la coma al final de la siguiente línea
    this.rabbitmqService.acknowledgeMessage(context);

    // Utiliza console.log para imprimir createFarmDto
    return this.farmsService.createFarm(createFarmDto);
  }
}
