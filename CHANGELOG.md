# Changelog

Progress log for the lab. Grouped by roadmap phase; newest first. See
[ROADMAP.md](./ROADMAP.md) for the plan and `docs/superpowers/specs/` for the
per-slice design notes.

## Phase 5 — Distributed expansion (in progress)

- **One database per service (`auth` / `farms`).** The last piece of the
  distributed monolith: the two services shared a PostgreSQL instance, `farms`
  reached into `users` through an eager `FarmEntity.user` relation, and the
  admin report queried the `users` table directly. Now:
  - **Split schema and connections.** Migrations, CLI data sources and the
    Postgres connection are per service (`apps/auth/src/db/migrations`,
    `apps/farms/src/db/migrations`; `AUTH_POSTGRES_URI` / `FARMS_POSTGRES_URI`);
    `PostgresDBModule` became a `forApp()` dynamic module. No FK crosses a
    database boundary — `FarmEntity.userId` is a plain indexed scalar, which is
    all the IDOR ownership chain ever needed.
  - **Event-carried read model.** `auth` publishes `user.created` /
    `user.updated` through **its own transactional outbox** (same reusable base
    class as `farms → tracing`); `farms` consumes them into a local
    `user_projection` table, upserted by `id` so redelivery converges. The
    report now groups farms by owner from that projection — a documented shape
    change — instead of joining `users`.
  - **Infra split** across `docker-compose`, the k8s manifests
    (`postgres-auth` / `postgres-farms` StatefulSets, per-service DB
    ConfigMaps) and the Helm chart (per-worker `postgres` map; both workers now
    migrate their own database).
  - **Verified, not asserted.** The IDOR e2e still passes with `farms` having
    zero access to `users`, and a new **consistency drill e2e** switches the
    relay off mid-registration, proves the event sits committed-but-unpublished
    in auth's outbox, lands once publishing resumes, and stays at exactly one
    row when the same event is redelivered.

- **Test coverage for the authorization boundary, before splitting the
  databases.** Phase 5 rewrites `OwnershipService` (the eager `farm.user`
  relation becomes a `farm.userId` scalar) and `report.service.ts`. Both were
  about to be rewritten with no test holding them: `ownership.service.ts` — the
  IDOR guard — had **no spec at all**, and `pnpm test:e2e` ran with
  `--passWithNoTests` against an empty directory, so it passed in green without
  executing anything. Two additions close that:
  - **`ownership.service.spec.ts`** — 19 tests, 100% statements/branches/
    functions/lines. Pins 403-for-someone-else's, 404-for-missing, and
    **fail-closed** when the ownership chain can't be resolved. It deliberately
    does *not* assert the `relations` lists, which are the implementation detail
    the split removes.
  - **`apps/gateway/test/idor.e2e-spec.ts`** — the authorization e2e the
    roadmap promised in Phase 1. Real Postgres, RabbitMQ, Redis and an SMTP
    sink via **Testcontainers**, with `gateway`, `auth` and `farms` booted
    in-process; the real migrations build the schema, and fixtures are created
    through the public API. 17 tests: user A is refused all of B's farms,
    crops, activities and harvests (read/update/delete, plus creating a crop
    inside B's farm), with a control group proving B *can* reach their own,
    404-not-403 for a missing resource, and 401 for missing/forged tokens.
  - Both were validated by mutation, not just by passing: neutering
    `OwnershipService.check()` turned 4 unit tests and 12 of the 17 e2e tests
    red — including the crop's name coming back `"Hijacked"` — while the
    control group, 404 and 401 tests stayed green.
  - `configureGateway()` (`apps/gateway/src/setup.ts`) and
    `configureRmqMicroservice()` (`libs/common/src/rmq/`) were extracted from
    the four `main.ts` files so the e2e exercises the **production** request
    pipeline (helmet/CORS/prefix/`ValidationPipe`/exception filters/
    ack-after-processing) instead of a look-alike that drifts silently. A new
    CI job runs the e2e suite.
  - **A production bug the e2e found immediately**: outbound RabbitMQ clients
    were built with a bare `ClientProxyFactory.create()` factory provider, which
    Nest does **not** lifecycle-manage — so `app.close()` left
    amqp-connection-manager's reconnecting socket and timers alive. A pod kept
    holding broker connections through a SIGTERM, and the test process hung
    forever after a green run. `RabbitmqModule.registerRmq` now goes through
    `ClientsModule.registerAsync` (same `@Inject('AUTH_SERVICE')` token), so
    Nest closes the clients on shutdown. The e2e run went from hanging
    indefinitely to exiting in 13 s.
- **Transactional outbox** (`farms`): creating a crop/activity/harvest used to
  `save()` the row and then fire-and-forget the tracing event — a dual write
  that silently loses the event if the RabbitMQ publish fails after the DB
  commit. Now the domain row and an `outbox` row are written in **one
  transaction** (atomic), and an `OutboxRelayService` polls the outbox every 3 s
  (`SELECT … FOR UPDATE SKIP LOCKED`), publishes pending events and marks them
  sent. Publishing is at-least-once; the tracing consumer's existing Redis
  idempotency makes that safe. `OUTBOX_RELAY_ENABLED=false` pauses the relay
  (events accumulate durably instead of being lost) — verified on the cluster by
  pausing it, creating crops, and watching the backlog drain to Mongo when
  re-enabled, with zero loss.
- **Distributed tracing (OpenTelemetry + Jaeger)**: every app starts the OTel
  Node SDK before Nest loads its libraries and auto-instruments HTTP, RabbitMQ,
  Postgres, Mongo and Redis, exporting OTLP to a Jaeger all-in-one in the
  `monitoring` namespace (`k8s/monitoring/30-jaeger.yaml`). A single
  `GET /api/v1/farms` produces **one 25-span trace** across gateway → auth and
  farms (over RabbitMQ) → Postgres — context propagates through RabbitMQ
  automatically, no manual plumbing. The trace immediately surfaced that the
  gateway's JWT guard makes a ~41 ms round-trip to the auth service per request.
- **Build change to make auto-instrumentation work**: OTel patches libraries as
  they are `require()`'d, but `nest build` bundled everything into one file, so
  there was nothing to patch. A `webpack.config.js` now externalizes
  node_modules (keeping only `@app/common` bundled); the bundle dropped from
  self-contained to ~190 KB and loads its deps from the prod install at runtime.
- `/health` probes and the `/metrics` scrape are excluded from tracing so the
  Jaeger UI shows only meaningful, cross-service traces.

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
