import { RmqContext, RmqOptions } from '@nestjs/microservices';

export interface RabbitmqServiceInterface {
  getRmqOptions(queue: string): RmqOptions;
  acknowledgeMessage(context: RmqContext): void;
}
