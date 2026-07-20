# Roadmap — from distributed monolith to a professional distributed NestJS backend

## Why this roadmap exists

This project began as an agricultural traceability product built on NestJS microservices, IPFS/Pinata, and an ERC-721 on Polygon. Its purpose has changed: it is now a **personal lab for mastering distributed backend architecture**. The agricultural domain is the test bench, not the goal. Everything follows from that — blockchain is removed, no frontend is built, no AI is integrated, and success is measured by the quality of the distributed system, not by feature count.

Removing blockchain is also the industry-aligned call. Verified research (2025–2026) shows the sector quietly de-blockchained: IBM withdrew Food Trust, Provenance dropped every blockchain mention from its site, Farmer Connect was absorbed by Agridence, and Hyperledger Grid has been End-of-Life since 2023. The live interoperability standards — GS1 EPCIS 2.0, W3C Verifiable Credentials 2.0, UN/CEFACT UNTP — use neither tokens nor ledgers. See Phase 0.

**The central diagnosis:** today this is not a distributed system, it is a **distributed monolith**. It has the aesthetics — four services, one broker — without the boundaries: the three services share **a single database**, and `tracing` imports `CropsService` and `HarvestService` from `farms` by relative path, even replicating its `TypeOrmModule.forFeature` to instantiate them. Changing an entity in `farms` breaks `tracing` at compile time.

That flaw is not a bug to patch — it is the syllabus. Turning it into a genuinely distributed system forces a pass through every real problem in the field, one at a time.

---

## Guiding principle

**Every phase leaves the system runnable, tested, and defensible.** No long-lived branches. If the lab is abandoned at phase 3, what was built up to there must still stand on its own.

**Tests and CI are not a phase — they are the floor from commit 1.** There are currently **zero** `.spec.ts` files, and the `test:e2e` script points at `apps/harvestledger/`, a directory that does not exist. Nothing below is verifiable until that is fixed first.

---

## Phase 0 — Remove blockchain and IPFS

Remove the layer that no longer serves the goal, **documenting the decision** rather than deleting it silently.

- Remove `tracing` as a blockchain service: drop `mintNft` and all of `ethers`/`cropABI.json`; remove `ethers` from `package.json`.
- Remove Pinata/IPFS: drop `pinMetadataToIpfs`, `getMetadataPinata`, `uploadImageToPinata`, `formatCropMetadata`, and their copies in the `activities` and `harvests` services.
- Replace the chained-CID mechanism with an **append-only history in Postgres**. The real value IPFS provided was the immutable log of activities on a crop; that becomes an insert-only events table — no update, no delete. The interesting property (an auditable history) is kept without the external dependency.
- Remove the dead fields `CropEntity.metadataLink` and `CropEntity.nftId`.
- **Repurpose, don't delete, `tracing`**: make it the service that owns the traceability history (the event log). This keeps a fourth service — enough topology — but with a real responsibility and a clean boundary.
- Document the removal in the README, with the research citations. This is the project's narrative asset.

Immediate cleanup: remove the unguarded `GET /tracing/getHello`, and the ~10 commented-out `console.log` blocks in `tracing.service.ts`.

---

## Phase 1 — Floor: tests, CI, validation, errors, security

Nothing flashy, all essential. This is where the junior-to-mid gap shows most.

**Tests and CI**
- Fix the broken `test:e2e` script and the four scaffold `app.e2e-spec.ts` files still expecting `GET / → 'Hello World!'` (a route that does not exist under the `api/v1` prefix).
- Add coverage thresholds to the Jest config (currently none).
- GitHub Actions (no `.github/` exists): lint + build + test on every push. Add Husky + lint-staged.
- **Commit `pnpm-lock.yaml`** — it is currently git-ignored, making builds non-reproducible. Remove `dist/` from the working tree.

**Validation**
- Register `ValidationPipe` in the three microservices. It currently exists only in the gateway; the `@Payload() x: CreateXDto` args of `@MessagePattern` handlers are **not validated at all**. Any message that reaches a service without going through the gateway arrives raw.
- Fix the broken DTOs (real bugs, not cosmetics): `createHarvestDto` has `@IsNumber() categroy: string` (misspelled field *and* wrong validator, making it unusable under `forbidNonWhitelisted`); `resetPassword.dto` has no decorators, so `whitelist` strips it to `{}`; `createActivityDto` has all-optional fields and no `cropId`; `createUserDto` mixes `@IsNotEmpty()` with `@IsOptional()`.
- Declare `class-transformer` — it is used (`transform: true`) but missing from `package.json`.
- Add `ParseIntPipe` to numeric query params (typed `number`, received as `string`).
- Replace `@Body() updateActivityDto: any` with the existing `UpdateActivityDto`.

**Errors**
- Create a global `ExceptionFilter` — there is not a single `@Catch` in the repo.
- Eradicate the "error-as-value with HTTP 200" pattern: "Farm already exists" returns 200 instead of 409; "User not found" 200 instead of 404; "Token has expired" 200 instead of 401.
- Add an RPC filter in the microservices so domain exceptions map coherently through RPC to the correct HTTP status (today they serialize as a generic RPC error → the gateway returns 500).
- Fix the catches that swallow: one controller returns nothing on failure; one service leaks the raw `error` object to the client.

**Security**
- **Resource authorization (IDOR) — the most serious hole.** `AuthGuard` validates the JWT but no one checks ownership. Passing someone else's `farmId`/`cropId` reaches their data, and uploads allow writing a photo onto another user's resource. Resolve the `User → Farm → Crop → Activity/Harvest` chain on every access.
- `RolesGuard` + a role enum. Today the only authorization is a hand-written `if (user.rol !== 'admin')`, dereferencing `user` without a null check → 500.
- Refresh-token rotation and revocation (a leaked token is valid for 7 days).
- Validate the `Bearer` scheme in `AuthGuard` (it accepts any two-part prefix).
- Add `helmet`, rate limiting (`@nestjs/throttler`), explicit CORS.
- **Environment schema validation** (Joi/zod) in `ConfigModule` — none today, and `ConfigService` coexists with 16 direct `process.env` reads, one of which runs at `@Module` decorator evaluation time, before `ConfigModule.forRoot()` loads `.env`.
- Remove the `console.log` calls that leak PII (decoded-token email; full user entity).

---

## Phase 2 — Real boundaries

Where it stops being a distributed monolith. Conceptually the most important phase.

- **Break the `tracing → farms` coupling**: replace the relative-path imports with RabbitMQ messages; the duplicated `TypeOrmModule.forFeature` in `tracing.module.ts` disappears with it.
- **One database per service.** The change that forces everything else: with no cross-context joins, data one service needs from another arrives by message or is replicated.
- **Decide the data layer, once.** Two architectures coexist: the `BaseAbstractRepository` pattern and direct `@InjectRepository`. The pattern is dead except in `auth`, and worse, in `farms.module.ts` all four repository tokens point to `FarmsRepository` by copy-paste. Recommendation: **delete the pattern and use `@InjectRepository` consistently** — the generic repository adds indirection without value over TypeORM.
- **Real migrations.** Drop `synchronize: true`, create the `data-source.ts` the migration scripts already invoke (and that does not exist), and version the schema.
- **Fix the entities**: inverse relations declared as `(x) => x.id` instead of the relational property; `email` without `unique`; `FarmEntity.name` globally unique instead of per-user.
- **Unify file storage.** Three destinations today (S3, local disk, Pinata) collapse to S3 alone. Fix `s3.service.ts`: the hardcoded `ContentType: 'image/jpeg'` and the catch that swallows failures and reports success anyway, persisting a key that points to nothing.
- **Stop sending binaries over RabbitMQ.** The gateway serializes the full Multer file into the message payload; after the JSON round-trip the buffer arrives as `{type:'Buffer',data:[...]}`. Upload directly to S3, or use presigned URLs.

---

## Phase 3 — Correctness under failure

The heart of the learning: the system must not corrupt itself when something fails halfway.

- **Ack after processing.** The **43** `acknowledgeMessage()` calls sit at the top of their handlers, so a later failure loses the message for good. Only `ack` exists — no `nack`/`reject` anywhere.
- DLQ, retries with backoff, and `prefetchCount` (currently the NestJS default, unconfigured).
- **Idempotency**: an idempotency key per message and a dedup table — with retries, every handler must run twice without duplicating effects.
- **Outbox pattern** — the phase's central exercise: write to the DB and publish the event in the same local transaction, with a relay publishing afterward. Solves the raw problem that exists today (save to Postgres, then fail to publish, with no compensation).
- Sagas and compensations for flows that cross services once the databases are split.
- Introduce `@EventPattern` — today **everything** is `@MessagePattern` request/response, even fire-and-forget work. Distinguishing command from event is part of the syllabus.
- Fix the broken `updateHarvest` handler along the way (`harvestId` is an undecorated param, always `undefined`).

---

## Phase 4 — Observability

With the system already correct, instrument it. Not before: instrumenting an incorrect system just yields pretty metrics of something wrong.

- Structured logging (pino, or the Nest `Logger` with a JSON transport) replacing the **24** `console.*` calls across 12 files, some leftover debug.
- Correlation ID propagated from the gateway through RabbitMQ into the services — without it, distributed traces are useless.
- OpenTelemetry: end-to-end distributed tracing, with Jaeger or Tempo in compose.
- Prometheus + Grafana metrics: latencies, queue depth, retry rate, DLQ messages.
- Health checks (`@nestjs/terminus`) with readiness and liveness. Today `docker-compose.yml` has **no** healthchecks and its `depends_on` only orders startup, without waiting for readiness.
- Harden the Dockerfiles: the four are byte-identical, `FROM node` untagged, no build, no `CMD`, no multi-stage, no non-root user, and `COPY package*.json` skips the lockfile. The `.dockerignore` is one line and excludes neither `node_modules` nor `.git`.

---

## Phase 5 — Scale

With instruments to measure, optimize without guessing.

- Load testing (k6 or Artillery) with synthetic traffic, since there are no real users.
- Fix the report's N+1 (a query per user for farms, per farm for crops, per crop for activities and harvests — and the admin report walks every user). The obvious bottleneck and a good real case to measure before/after.
- Cache (Redis), backpressure, connection pooling, indexes guided by real execution plans.
- Horizontal scaling of consumers, verifying the phase-3 idempotency holds under concurrency.

---

## Verification

1. **Baseline**: `pnpm install && pnpm build` — all four services compile.
2. **Phase 0**: `docker compose up --build` with no Pinata/blockchain vars in `.env`; the farm → crop → activity → harvest flow works end to end via Swagger (`/api/docs`).
3. **Phase 1**: `pnpm test` with real coverage; an explicit IDOR test (user A requests user B's `cropId` → 403); a test that an invalid payload sent **directly to the queue** is rejected, not only the one going through the gateway.
4. **Phase 2**: `tracing` boots without importing anything from `farms`; the schema is created solely by migrations, with `synchronize: false`.
5. **Phase 3** — the most important, tested hard: kill a service mid-handler and confirm the message reprocesses without duplicating effects; resend the same message twice for an identical result; drop RabbitMQ with writes in flight and confirm the outbox publishes them on recovery; force repeated failures and confirm the message lands in the DLQ, not an infinite loop.
6. **Phase 4**: one HTTP request produces a complete, correlated trace in Jaeger across gateway → broker → service → database.
7. **Phase 5**: a load report with before/after numbers, not impressions.
