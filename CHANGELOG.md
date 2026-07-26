# Changelog

Progress log for the lab. Grouped by roadmap phase; newest first. See
[ROADMAP.md](./ROADMAP.md) for the plan and `docs/superpowers/specs/` for the
per-slice design notes.

## Phase 4 — Load & observability (in progress)

- **Report N+1 fixed + cached**: the admin report replaced its per-user/-farm/
  -crop query walk (and a bug that dropped activities) with one nested read
  (`relationLoadStrategy: 'query'`), cached in Redis (60s). Verified: cache hit
  ~2x the miss.
- **Structured JSON logging** (nestjs-pino) on all apps, with a correlation id
  reused/echoed per request; the last `console.*` calls removed.
- **Prometheus + Grafana** (`k8s/monitoring/`): the gateway exposes `/metrics`
  (Node defaults + an HTTP request-duration histogram); Prometheus scrapes
  every gateway pod (kubernetes_sd) and Grafana ships a request-rate / p95 /
  5xx dashboard.
- **k6 load test** (`load/k6/gateway.js`): a run drove 24,211 requests at
  ~179 req/s, 0 failures, p95 67 ms; the HPA scaled the gateway 2 → 5 replicas
  on CPU (metrics-server), and Prometheus (all pods) matched the client count.
  Gateway throttle is now env-configurable so it doesn't cap the test.
- Still open: correlation-id propagation *through* RabbitMQ into microservice
  logs (pairs with Phase 5 distributed tracing).

## Phase 3 — Kubernetes (in progress)

- HTTP `/health` endpoints (`@nestjs/terminus`) on all four apps; the three
  RabbitMQ-only services are now hybrid apps listening on a health port for
  probes.
- Raw Kubernetes manifests (`k8s/`) and a Helm chart (`helm/`): the four apps
  (gateway with Service/Ingress/HPA), the four stateful backends as
  StatefulSets, ConfigMap/Secret, resource requests/limits and liveness/
  readiness probes.
- **Verified on a local kind cluster (k8s 1.36):** all four images build and
  run, every pod reaches Ready, and a gateway smoke test (health, register,
  login with a Redis-backed rotated refresh token) passes end to end. Two real
  bugs were fixed in the process (prod Docker install running husky;
  image-name mangling in the worker manifests).
- **ingress-nginx wired up, edge hardened, TLS added** (`k8s/` and `helm/`):
  the gateway `Ingress` now declares `ingressClassName: nginx` so it's
  actually claimed by a controller instead of being reachable only via
  `port-forward`. Added `proxy-body-size`/timeouts for uploads passing through
  to S3/MinIO, and an edge `limit-rps`/`limit-connections` that bounds request
  rate regardless of HPA replica count (the gateway's own `ThrottlerModule` is
  per-pod, so its 100 req/min floats to 200-600 req/min across 2-6 replicas).
  TLS terminates at the Ingress via a self-signed cert-manager `Issuer`
  (`k8s/02-tls.yaml`, `helm/templates/tls.yaml`) — a K8s/cert-manager
  exercise, not real transport security for a non-public host. A
  `kind-config.yaml` maps host 80/443 for the controller; `k8s/README.md`
  documents the full bring-up from a fresh cluster.

## Phase 2 — Progress made visible (done)

- CI status badge in the README; this changelog.
- Clean multi-stage Dockerfiles for all four apps (`node:24-alpine`, pinned
  pnpm, lockfile-based install, `nest build` to a self-contained bundle, a
  prod-only runner running as a non-root user). Replaces the byte-identical
  `FROM node` / no-build / no-CMD stubs. A proper `.dockerignore` too; local
  dev keeps `start:dev` via the compose `target: builder`. The image build is
  verified locally; running the containers is verified in Phase 3.

## Phase 1 — Stable (largely done)

**Tests & CI**
- First `.spec.ts` files (previously zero): unit tests for the auth, crops,
  activities, harvests and tracing services plus the shared filters, guards and
  Redis/S3 wrappers — 60 tests, scoped coverage thresholds enforced.
- GitHub Actions (lint + build + unit tests with coverage) on every push/PR;
  Husky + lint-staged pre-commit hook; `pnpm-lock.yaml` committed and installs
  run `--frozen-lockfile`.

**Validation**
- `ValidationPipe` registered on the three microservices, not just the gateway,
  via a shared `buildValidationPipe()`; `class-transformer` declared explicitly.
- Fixed broken DTOs (harvest `categroy`→`category`, decorator-less
  `resetPassword`, missing `cropId` on activities, the `createUser` `lastName`
  contradiction); `ParseIntPipe` on every numeric query/param.

**Errors**
- Global exception filters: an `RpcExceptionFilter` (microservice) serializes a
  thrown domain exception's status over RabbitMQ and an `HttpExceptionFilter`
  (gateway) restores it — ending the "409/404/401 returned as HTTP 200" pattern.
- Services throw `NotFound`/`Conflict`/`BadRequest`/`Unauthorized` instead of
  returning `{ status: 'error' }`; removed swallow-and-mask `try/catch` blocks.

**Security**
- Resource-ownership (IDOR): an `OwnershipService` resolves
  `User → Farm → Crop → Activity/Harvest` and every operation asserts it
  (403 vs 404); `userId` threaded end to end.
- `RolesGuard` + `Role` enum + `@Roles()` replacing a null-deref'ing
  `user.rol !== 'admin'`; helmet, rate limiting, explicit CORS, fail-fast Joi
  env validation, Bearer-scheme check.
- Redis-backed refresh-token **rotation + revocation** (reuse detection).

**Data hygiene**
- `s3.service` no longer swallows a failed upload as success, and preserves the
  real content type; `getFile` rethrows unexpected errors.
- Entity fixes: `email` unique, farm name unique **per owner**, corrected
  bidirectional relation inverse sides.

**Reliable messaging** (done, verified on a kind cluster)
- Ack-after-processing via a global interceptor (RPC ack-always; events
  nack/retry), replacing 41 ack-at-top-of-handler calls that lost a message on
  a mid-handler crash; `prefetchCount` for fair dispatch.
- Redis-backed idempotency for the tracing events (process-once, with rollback
  on failure).
- Retry-with-backoff + dead-letter topology for the event queue: a failing
  event cycles through a TTL retry queue and, after N attempts, is parked in a
  DLQ (verified end to end by taking Mongo down).
- Fixed several latent bugs that only surfaced once the stack actually ran:
  `inheritAppConfig` (global enhancers weren't applied to the microservices),
  orphaned crops (a plain `farmId` never mapped to the farm FK), the event DTO
  being whitelisted to `{}`, and createFarm's payload shape.

**Data hygiene — migrations**
- Dropped `synchronize: true`; the schema is now owned by TypeORM migrations
  (`libs/common/src/migrations`, bundled into each app). A `data-source.ts` runs
  the CLI via ts-node; the initial migration captures the current schema
  (unique email, per-owner farm name, all FKs). Migrations run on startup on a
  single worker (`auth`, via `DB_RUN_MIGRATIONS`) so services don't race.
  Verified on the cluster: from an empty schema auth applies the migration and
  the full flow works.

## Phase 0 — Remove blockchain and IPFS (done)

- Removed `ethers`, the ERC-721 mint, Pinata/IPFS and the `tracing → farms`
  compile-time coupling. `tracing` is repurposed as the owner of an append-only
  event history in **MongoDB**, fed by fire-and-forget events from `farms`.
- Added MinIO as a local S3-compatible store for development.
