import { INestApplication } from '@nestjs/common';
import { buildValidationPipe } from '../pipes';
import { RpcExceptionFilter } from '../filters';
import {
  RmqReliabilityInterceptor,
  RmqReliabilityOptions,
} from '../interceptors';
import { RabbitmqService } from '../services/rabbitmq.service';

/**
 * The RabbitMQ-consumer half of a microservice's bootstrap, shared by
 * `auth`, `farms` and `tracing` — and by the e2e harness, which is the point:
 * a test that wires its own pipes/filters/interceptors is testing a pipeline
 * that only resembles production, and drifts from it silently.
 *
 * Deliberately does NOT call `startAllMicroservices()` or `listen()`. Those are
 * lifecycle decisions the caller owns (`main.ts` serves HTTP /health for the
 * Kubernetes probes; the e2e harness does not bind a port).
 */
export function configureRmqMicroservice(
  app: INestApplication,
  queue: string,
  reliability?: RmqReliabilityOptions,
): void {
  // Validate @Payload() DTOs on the @MessagePattern handlers, not just at the gateway.
  app.useGlobalPipes(buildValidationPipe());
  // Serialize thrown domain exceptions so their status survives the RPC hop.
  app.useGlobalFilters(new RpcExceptionFilter());
  // Ack after processing (not before): crash-safe message handling.
  app.useGlobalInterceptors(new RmqReliabilityInterceptor(reliability));

  const bus = app.get(RabbitmqService);
  app.connectMicroservice(bus.getRmqOptions(queue), {
    inheritAppConfig: true,
  });
}
