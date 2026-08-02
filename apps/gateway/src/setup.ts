import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { buildValidationPipe, HttpExceptionFilter } from '@app/common';

/**
 * The gateway's HTTP configuration, shared by `main.ts` and the e2e harness so
 * a test exercises the same security headers, prefix, validation and error
 * mapping that production does — instead of a look-alike that can drift.
 *
 * Swagger and `listen()` stay in `main.ts`: docs are not part of the request
 * pipeline, and the harness binds no port (supertest drives the http server
 * directly).
 */
export function configureGateway(app: INestApplication): void {
  // Security headers.
  app.use(helmet());

  // Explicit CORS instead of the wide-open default. CORS_ORIGINS is a
  // comma-separated allowlist; unset means same-origin only.
  const corsOrigins = process.env.CORS_ORIGINS;
  app.enableCors({
    origin: corsOrigins ? corsOrigins.split(',').map((o) => o.trim()) : false,
    credentials: true,
  });

  // /health and /metrics stay at the root (outside the API prefix) for the
  // Kubernetes probes and the Prometheus scrape.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });

  // Without this, the class-validator decorators on the DTOs never run.
  app.useGlobalPipes(buildValidationPipe());

  // Coherent HTTP errors, including statuses propagated from the microservices.
  app.useGlobalFilters(new HttpExceptionFilter());
}
