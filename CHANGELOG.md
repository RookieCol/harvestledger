# Changelog

Progress log for the lab. Grouped by roadmap phase; newest first. See
[ROADMAP.md](./ROADMAP.md) for the plan and `docs/superpowers/specs/` for the
per-slice design notes.

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

**Still deferred to Phase 3+**: real migrations (dropping `synchronize: true`).

## Phase 0 — Remove blockchain and IPFS (done)

- Removed `ethers`, the ERC-721 mint, Pinata/IPFS and the `tracing → farms`
  compile-time coupling. `tracing` is repurposed as the owner of an append-only
  event history in **MongoDB**, fed by fire-and-forget events from `farms`.
- Added MinIO as a local S3-compatible store for development.
