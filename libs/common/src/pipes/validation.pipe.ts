import { ValidationPipe } from '@nestjs/common';

/**
 * The single ValidationPipe configuration shared by the gateway (HTTP) and the
 * microservices (RabbitMQ). Registering it on the microservices is what makes
 * `@Payload()` DTOs on `@MessagePattern` handlers actually validated — without
 * it, only the gateway validated and a message crafted straight onto the queue
 * bypassed every check.
 */
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true, // strips properties not declared on the DTO
    forbidNonWhitelisted: true, // and rejects the payload if any come through
    transform: true, // converts plain payloads into typed DTO instances
  });
}
