import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

/**
 * Liveness/readiness endpoint for Kubernetes probes. Kept dependency-free
 * (an empty check → 200 when the process can serve HTTP), which is the right
 * signal for a liveness probe. Readiness with datastore pings can be layered on
 * per service later without changing the probe path.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }
}
