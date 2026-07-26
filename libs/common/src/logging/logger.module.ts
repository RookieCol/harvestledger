import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';

/**
 * Structured (JSON) logging for every app via pino. In development it renders
 * pretty; in the cluster (NODE_ENV=production) it emits one JSON object per
 * line, ready for log aggregation. Every HTTP request carries a correlation id
 * — reused from an inbound `x-correlation-id` header or freshly generated and
 * echoed back — so a request can be followed across the edge and, when passed
 * on, downstream.
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        genReqId: (req, res) => {
          const incoming = req.headers['x-correlation-id'];
          const id =
            (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
          res.setHeader('x-correlation-id', id);
          return id;
        },
        customProps: (req) => ({ correlationId: req.id }),
        // Never log credentials.
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        autoLogging: {
          // The k8s probe hammers /health; don't log those.
          ignore: (req) => req.url === '/health',
        },
      },
    }),
  ],
})
export class AppLoggerModule {}
