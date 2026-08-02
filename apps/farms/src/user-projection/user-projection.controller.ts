import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { UserProjectionEventDto } from '@app/common';
import { UserProjectionService } from './user-projection.service';

// Acking is handled globally by RmqReliabilityInterceptor (ack after
// processing; events nack-to-DLQ on error).
@Controller()
export class UserProjectionController {
  constructor(private readonly userProjectionService: UserProjectionService) {}

  @EventPattern('user.created')
  async handleUserCreated(@Payload() data: UserProjectionEventDto) {
    await this.userProjectionService.upsert(data);
  }

  @EventPattern('user.updated')
  async handleUserUpdated(@Payload() data: UserProjectionEventDto) {
    await this.userProjectionService.upsert(data);
  }
}
