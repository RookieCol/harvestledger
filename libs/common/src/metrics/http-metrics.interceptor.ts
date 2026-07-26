import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram } from 'prom-client';
import { Observable, tap } from 'rxjs';

export const HTTP_REQUEST_DURATION = 'http_request_duration_seconds';

/**
 * Records request latency (and, by count, throughput and status mix) as a
 * Prometheus histogram labelled by method, route and status — the raw material
 * for the RPS / p95 / error-rate panels in Grafana.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric(HTTP_REQUEST_DURATION)
    private readonly histogram: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const stop = this.histogram.startTimer();
    const route = () =>
      request.route?.path ?? request.url?.split('?')[0] ?? 'unknown';

    return next.handle().pipe(
      tap({
        next: () => {
          stop({
            method: request.method,
            route: route(),
            status: context.switchToHttp().getResponse().statusCode,
          });
        },
        error: (err) => {
          // On a thrown error the response status isn't set yet — read it from
          // the exception so a 401/404/409 isn't mislabelled as 200.
          const status = err instanceof HttpException ? err.getStatus() : 500;
          stop({ method: request.method, route: route(), status });
        },
      }),
    );
  }
}
