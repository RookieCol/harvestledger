# Roadmap — stabilize, go polyglot, run it on Kubernetes under load

## Why this roadmap exists

This project began as an agricultural traceability product built on NestJS microservices, IPFS/Pinata, and an ERC-721 on Polygon. Its purpose has changed: it is now a **personal lab**. The agricultural domain is the test bench, not the goal. The concrete objectives are narrow and honest:

1. **Make it stable** — no lost/corrupted data, real validation, coherent errors, resource-level security, tested.
2. **Show progress** — green CI, coverage, clean images; a system that visibly works.
3. **Practice Kubernetes** — proper images, health probes, manifests/Helm, run it on a local cluster.
4. **Load-test it** — synthetic traffic, enough observability to read the results, then tune.

A fifth theme runs across these: **polyglot persistence** — use PostgreSQL, MongoDB, and Redis, each where it is genuinely the right tool (see below), not for show.

**Sequencing over scope.** The four goals above come first. A genuinely distributed architecture — one database per service, a new service, cross-service distributed tracing — is a real ambition, but it is gated behind stability as an optional **Phase 5**, because doing it *properly* brings back the consistency work (the outbox pattern) that a shared database lets us skip. Splitting databases without that is a distributed monolith with extra steps.

**Still out of scope, unless a concrete need appears:** event sourcing and CQRS. Full sagas stay out too; the outbox in Phase 5 covers cross-service write consistency without them. Removing blockchain is the industry-aligned call — see the [research study](./docs/research/2026-07-agrifood-traceability-landscape.md) and the README's architecture-decisions section.

**The starting diagnosis:** today this is honestly a *distributed monolith* — four services and a broker, but a single shared database and a compile-time coupling between `tracing` and `farms`. Stabilizing it means giving it real boundaries where they matter, without chasing distributed-systems purity it doesn't need.

---

## Guiding principle

**Every phase leaves the system runnable, tested, and defensible.** No long-lived branches. If the lab is paused at any phase, what exists must still stand on its own.

**Tests and CI are the floor from commit 1.** There are currently **zero** `.spec.ts` files, and the `test:e2e` script points at `apps/harvestledger/`, a directory that does not exist. Nothing below is verifiable until that is fixed.

---

## Polyglot persistence — the plan, and the honest caveat

Each store is bound to a use case where it fits. Adding a database for its own sake is a code smell; this table is the justification a reviewer will look for.

| Store | Role | Why this tool |
|---|---|---|
| **PostgreSQL** | Relational domain: users, farms, crops, harvests. | Relations, constraints, transactions. Already in place. |
| **MongoDB** | Append-only traceability event history (replaces the IPFS chain). | Events are heterogeneous and append-only — awkward relationally, natural as documents. |
| **Redis** | Coordination and cache: idempotency keys, refresh-token revocation, rate limiting, caching the report. | The standard tool for exactly the stability and load goals. |

**Caveat that travels with this:** writing to Postgres *and* Mongo in one operation is a dual write — one can succeed while the other fails, reintroducing the consistency problem an outbox would solve. Since sagas are out of scope, this is handled with idempotency plus a light reconciliation, or by accepting explicit eventual consistency. Stated plainly rather than hidden.

---

## Phase 0 — Remove blockchain and IPFS

Remove the layer that no longer serves the goal, **documenting the decision** rather than deleting it silently.

- Remove `tracing` as a blockchain service: drop `mintNft` and all of `ethers`/`cropABI.json`; remove `ethers` from `package.json`.
- Remove Pinata/IPFS: drop `pinMetadataToIpfs`, `getMetadataPinata`, `uploadImageToPinata`, `formatCropMetadata`, and their copies in the `activities` and `harvests` services.
- **Replace the chained-CID mechanism with an append-only event history in MongoDB** — insert-only, one document per farming event. The auditable-history property is kept; the external dependency is dropped; and it becomes the project's document-store showcase.
- Remove the dead fields `CropEntity.metadataLink` and `CropEntity.nftId`.
- **Repurpose, don't delete, `tracing`**: make it the service that owns the event history (now MongoDB-backed). Keeps a fourth service with a real responsibility and a clean boundary.
- Immediate cleanup: remove the unguarded `GET /tracing/getHello` and the ~10 commented-out `console.log` blocks in `tracing.service.ts`.

---

## Phase 1 — Stable

The bulk of the work, and where "stable" is actually earned.

**Tests and CI**
- Fix the broken `test:e2e` script and the four scaffold `app.e2e-spec.ts` files still expecting `GET / → 'Hello World!'` (a route that does not exist under `api/v1`).
- Add coverage thresholds to the Jest config (currently none).
- GitHub Actions (no `.github/` exists): lint + build + test on every push. Add Husky + lint-staged.
- **Commit `pnpm-lock.yaml`** (currently git-ignored → non-reproducible builds); remove `dist/` from the working tree.

**Validation**
- Register `ValidationPipe` in the three microservices — today it exists only in the gateway, so `@Payload()` DTOs on `@MessagePattern` handlers are **not validated at all**.
- Fix the broken DTOs (real bugs): `createHarvestDto` has `@IsNumber() categroy: string`; `resetPassword.dto` has no decorators; `createActivityDto` is all-optional with no `cropId`; `createUserDto` mixes `@IsNotEmpty()` with `@IsOptional()`.
- Declare `class-transformer` (used via `transform: true`, missing from `package.json`); add `ParseIntPipe` to numeric query params; replace `@Body() updateActivityDto: any`.

**Errors**
- Create a global `ExceptionFilter` (there is not one `@Catch` in the repo).
- Eradicate the "error-as-value with HTTP 200" pattern (409/404/401 currently return 200); add an RPC filter so domain exceptions map coherently through RPC to HTTP; fix catches that swallow (one controller returns nothing on failure; one service leaks the raw `error`).

**Security**
- **Resource authorization (IDOR) — the most serious hole.** Resolve the `User → Farm → Crop → Activity/Harvest` ownership chain on every access; uploads currently let a user write onto another user's resource.
- `RolesGuard` + a role enum (today it's a hand-written `if (user.rol !== 'admin')` with a null-deref → 500).
- Refresh-token rotation and revocation (backed by Redis); validate the `Bearer` scheme; add `helmet`, `@nestjs/throttler`, explicit CORS; env schema validation (Joi/zod) in `ConfigModule`; remove the `console.log` calls leaking PII.

**Auth extension — OAuth2 social login (optional, done last in this phase).** Add Google/GitHub sign-in via `@nestjs/passport` strategies, reusing the JWT/refresh model already in place. The value is in doing it *correctly*, not in having login buttons: Authorization Code **+ PKCE** (not implicit), **account linking** so an external identity maps to the existing user rather than duplicating it, and integration with the Redis-backed refresh rotation and revocation above. Built on the hardened base, not ahead of it — a clean OAuth flow over an unresolved IDOR is not a selling point.

**Reliable messaging** (the part of "stable" that keeps data intact)
- **Ack after processing.** The **43** `acknowledgeMessage()` calls sit at the top of their handlers — a later failure loses the message. Only `ack` exists; no `nack`/`reject`.
- DLQ, retries with backoff, `prefetchCount`.
- **Idempotency** (Redis-backed key + dedup): with retries, every handler must run twice without duplicating effects — and this is what keeps the Postgres/Mongo dual write honest.
- Fix the outright-broken handlers along the way: `updateHarvest` (`harvestId` undecorated, always `undefined`) and `activitiesByFarm` (actually filters by `cropId`).

**Data hygiene**
- Real migrations: drop `synchronize: true`, create the missing `data-source.ts` the scripts already invoke, version the schema.
- Fix entities (inverse relations as `(x) => x.id`; `email` without `unique`; `FarmEntity.name` globally unique instead of per-user).
- Unify file storage to S3 alone (drop local disk + Pinata); fix `s3.service.ts` (hardcoded `image/jpeg`; a catch that swallows failures and reports success). Stop sending file binaries through RabbitMQ.
- Break the `tracing → farms` compile-time coupling (relative-path imports) — replace with messages. This is the one boundary fix worth doing regardless of scope.

---

## Phase 2 — Progress made visible

- Green CI and a coverage badge in the README; a short progress log or CHANGELOG.
- Clean multi-stage Docker images (prep for Kubernetes).
- The README already narrates came-from / is / going; keep it honest as phases land.

---

## Phase 3 — Kubernetes

The technology to practice. `docker-compose` stays for local dev; Kubernetes is the deployment exercise.

- **Harden the Dockerfiles**: today the four are byte-identical, `FROM node` untagged, no build, no `CMD`, no multi-stage, no non-root user, and `COPY package*.json` skips the lockfile. The `.dockerignore` is one line.
- Health checks (`@nestjs/terminus`) with readiness and liveness probes — today `docker-compose.yml` has none.
- Kubernetes manifests, then a Helm chart: Deployments for the stateless services, `ConfigMap`/`Secret` for config, `Service`/`Ingress` for the gateway, resource requests/limits, and an `HPA`.
- Stateful backends (Postgres, MongoDB, Redis, RabbitMQ) run via StatefulSets or operators in the lab cluster — part of the K8s learning.
- Run on a local cluster (kind or minikube), documented so it comes up from scratch.

---

## Phase 4 — Load and observability

- Load testing (k6 or Artillery) with synthetic traffic, since there are no real users.
- Enough observability to read the results: structured logging (replacing the **24** `console.*` calls), correlation IDs propagated through RabbitMQ, Prometheus metrics (+ Grafana), and optionally OpenTelemetry traces.
- Redis-cache the report and **fix its N+1** (a query per user for farms, per farm for crops, per crop for activities and harvests — the admin report walks every user). The obvious bottleneck; measure before/after.
- Tune with the HPA from Phase 3; verify idempotency holds under concurrency; document numbers, not impressions.

---

## Phase 5 — Distributed expansion (optional, gated behind stability)

Only once the base is stable. This is where the project earns "distributed" honestly rather than cosmetically — and where the technology practice (K8s topology, cross-service tracing) gets more interesting.

- ✅ **One database per service** — done for `auth`/`farms`: each owns a PostgreSQL instance, `FarmEntity.userId` is a plain scalar (no cross-database FK, no join), and `farms` keeps a local `user_projection` read model fed by `user.created`/`user.updated` events instead of querying `users`. (`tracing` already owned its MongoDB.)
- ✅ **The outbox pattern comes back here** — splitting databases reintroduces cross-service write consistency, and the outbox is what makes it correct (write + publish in one local transaction, relay afterward). Both directions now use the same reusable base: `farms → tracing` and `auth → farms`.
- **A new service** — introduced to exercise the topology (a natural candidate: a read/reporting service, or a notifications service split out of the current shared code).
- **Richer distributed tracing** — end-to-end spans across the larger mesh, building on the OpenTelemetry + correlation IDs from Phase 4.

Still out unless a concrete need appears: event sourcing, CQRS, full sagas (the outbox covers write consistency without them).

---

## Verification

1. **Baseline**: `pnpm install && pnpm build` — all four services compile.
2. **Phase 0**: `docker compose up --build` with no Pinata/blockchain vars; the farm → crop → activity → harvest flow works end to end via Swagger, and each activity produces a document in the MongoDB event history.
3. **Phase 1**: `pnpm test` with real coverage; an explicit IDOR test (user A requests user B's `cropId` → 403); an invalid payload sent **directly to the queue** is rejected; a message replayed twice produces one effect (idempotency); a killed handler reprocesses without duplicating.
4. **Phase 2**: CI is green on `main` with the badge rendering; images build multi-stage.
5. **Phase 3**: the stack comes up on a fresh kind/minikube cluster from the manifests/Helm chart alone; probes report healthy; the gateway is reachable through the Ingress.
6. **Phase 4**: a k6 run produces a load report with before/after numbers around the N+1 fix and the cache; metrics and correlated logs are visible for a request path.
7. **Phase 5 (if pursued)**: kill a service with cross-service writes in flight and confirm the outbox publishes them on recovery; a distributed trace spans the request end to end through the new service.
