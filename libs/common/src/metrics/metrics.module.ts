import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  PrometheusModule,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import {
  HTTP_REQUEST_DURATION,
  HttpMetricsInterceptor,
} from './http-metrics.interceptor';

/**
 * Exposes Prometheus metrics at `/metrics`: Node.js defaults (event loop,
 * memory, GC, …) plus an HTTP request-duration histogram recorded by a global
 * interceptor. Import in an app that serves HTTP (the gateway).
 */
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [
    makeHistogramProvider({
      name: HTTP_REQUEST_DURATION,
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    }),
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class MetricsModule {}
