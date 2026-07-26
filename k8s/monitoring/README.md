# Monitoring — Prometheus + Grafana

Observability stack for the lab, in its own `monitoring` namespace.

- **Prometheus** discovers the gateway pods (kubernetes_sd, `role: pod`) and
  scrapes each one's `/metrics` every 10s — so the numbers are correct across
  all HPA replicas, not just whichever pod a Service load-balances to.
- **Grafana** auto-provisions the Prometheus datasource and a
  "HarvestLedger — Gateway" dashboard (request rate by status, p95 latency by
  route, 5xx rate, total requests, memory).
- **Jaeger** (all-in-one) collects OpenTelemetry traces over OTLP/HTTP. Every
  app auto-instruments HTTP, RabbitMQ, Postgres, Mongo and Redis and exports to
  `jaeger.monitoring.svc:4318`; a single request produces one trace spanning
  gateway → auth/farms (over RabbitMQ) → the database. The `/health` probes and
  the `/metrics` scrape are filtered out so the traces stay meaningful.

## Bring-up

```bash
kubectl apply -f k8s/monitoring/
kubectl -n monitoring rollout status deploy/prometheus deploy/grafana
```

## Open the dashboards

```bash
kubectl -n monitoring port-forward svc/grafana 3001:3000
# → http://localhost:3001  (anonymous admin is enabled for the lab)
#   Dashboards → HarvestLedger → "HarvestLedger — Gateway"

kubectl -n monitoring port-forward svc/prometheus 9090:9090
# → http://localhost:9090

kubectl -n monitoring port-forward svc/jaeger 16686:16686
# → http://localhost:16686  (Search → service "gateway" → pick a GET /api/v1/farms
#   trace to see the gateway → auth/farms → Postgres waterfall)
```

## Distributed tracing (OpenTelemetry)

Each app starts the OTel Node SDK as the first thing in `main.ts`
(`libs/common/src/tracing/otel.ts`), before Nest loads the instrumented
libraries. For that to work the webpack bundle **externalizes** node_modules
(`webpack.config.js`) — auto-instrumentation monkey-patches libraries as they
are `require()`'d, and a bundled library is never `require()`'d. Tracing is a
no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set; `OTEL_SERVICE_NAME` per
Deployment names each service. Context propagates across RabbitMQ automatically
(the amqplib instrumentation injects/extracts the `traceparent` through NestJS's
RMQ transport — no manual plumbing).

## Load test

```bash
# HPA scaling needs metrics-server (kind: patch with --kubelet-insecure-tls).
# The gateway's per-pod throttle (100 req/min) would cap the test — raise it:
kubectl -n harvestledger set env deploy/gateway THROTTLE_LIMIT=100000

kubectl -n harvestledger run k6 --rm -i --restart=Never \
  --image=grafana/k6:latest --command -- k6 run - < load/k6/gateway.js
```

A representative run drove **24,211 requests at ~179 req/s, 0 failures, p95
67 ms**, and the HPA scaled the gateway **2 → 5** replicas on CPU. Remember to
set `THROTTLE_LIMIT` back (or delete the env) after testing.
