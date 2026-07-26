import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// Distributed tracing bootstrap. This file is imported for its SIDE EFFECT as
// the very FIRST line of every app's main.ts — before Nest pulls in http, pg,
// mongodb, amqplib or ioredis. OpenTelemetry auto-instrumentation works by
// monkey-patching those libraries as they are require()'d, so the SDK has to
// start first and the libraries must not be bundled (see webpack.config.js,
// which externalizes node_modules so they are require()'d at runtime).
//
// No-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set, so local/dev and unit tests
// run untouched.
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'harvestledger',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Filesystem spans are noise and swamp the traces.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Don't trace the Kubernetes probes or the Prometheus scrape — they
        // produce a flood of single-service traces that bury the real ones.
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? '';
            return url.startsWith('/health') || url.startsWith('/metrics');
          },
        },
      }),
    ],
  });

  sdk.start();

  const shutdown = () => {
    sdk
      .shutdown()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
