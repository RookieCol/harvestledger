# Phase 5 — One database per service (auth / farms)

**Status:** proposed
**Roadmap reference:** [ROADMAP.md § Phase 5 — Distributed expansion](../../../ROADMAP.md#phase-5--distributed-expansion-optional-gated-behind-stability)

## Why

Today `auth` and `farms` are a distributed monolith wearing microservice
clothes: one Postgres instance, one set of credentials, and a real
compile-time-adjacent coupling at the data layer — `FarmEntity.user` is an
**eager** `@ManyToOne(UserEntity)`, `auth.module.ts` registers farms' entities
and vice versa, `ownership.service.ts` walks `farm.user`/`crop.farm.user`
object graphs, and `report.service.ts` starts its query **from `users`** and
joins the entire farm/crop/activity/harvest tree in one call while reading
`user.rol` straight out of the shared DB. None of this can survive giving each
service its own database — that is the whole point of the split, and the
reason the outbox pattern (already built for `farms → tracing`) comes back
here, now for `auth → farms`.

**Scope:** database split only. The second half of Phase 5 in the roadmap ("a
new service", e.g. notifications) is deliberately deferred to its own
spec/plan once two independently-owned databases are the baseline —
sequencing over scope, same principle the roadmap itself states.

## Design

### Topology — one Postgres instance per service

- `postgres-auth` and `postgres-farms`: separate containers/StatefulSets, each
  with its own volume, credentials, and `POSTGRES_URI`
  (`AUTH_POSTGRES_URI` / `FARMS_POSTGRES_URI`).
- Each service runs **its own** TypeORM migrations against its own database
  (`DB_RUN_MIGRATIONS=true` on both — no more race to guard against, since
  they no longer share an instance).
- `apps/auth/src/db/data-source.ts` (already exists) is trimmed to register
  only `UserEntity` + `OutboxEntity`. A new `apps/farms/src/db/data-source.ts`
  registers `FarmEntity, CropEntity, ActivitiesEntity, HarvestEntity,
  OutboxEntity, UserProjectionEntity`.
- `libs/common/src/migrations/` (currently one shared folder) splits into
  `apps/auth/src/db/migrations/` (table `users`) and
  `apps/farms/src/db/migrations/` (`farms, crops, activities, harvests,
  outbox, user_projection` — **no FK from `farms.userId` to `users.id`**; it
  cannot exist once the tables live in different engines).
- `apps/auth/src/auth.module.ts` stops registering `FarmEntity, CropEntity,
  ActivitiesEntity, HarvestEntity` — dead weight today (`auth.service.ts`
  never touches them), and actively wrong once the DBs are separate.

### Data flow — read-model in `farms`, fed by events from `auth`

Cross-context data travels by message, per the roadmap's own principle for
Phase 5.

- The generic outbox machinery in `apps/farms/src/outbox/` (`OutboxEntity`,
  `OutboxService.enqueue`, the polling `OutboxRelayService`) moves to
  `libs/common` as a reusable module, so `auth` doesn't reimplement it. Each
  service still owns its **own** `outbox` table in its **own** database — the
  table is not shared.
- `auth` publishes `user.created` on signup and `user.updated` whenever
  `firstName`, `lastName`, `email`, or `rol` change — written in the same
  local transaction as the domain row, relayed out-of-band, exactly like
  `crop.initialized` today.
- `farms` adds `@EventPattern('user.created')` / `@EventPattern('user.updated')`
  handlers that **upsert by `id`** into a new local table, `user_projection`:
  `id, firstName, lastName, email, rol, updatedAt`. Nothing else — no
  gender/document/date of birth/country/city. Those stay `auth`'s private
  data; `farms` never had a legitimate reason to see them, and trimming the
  contract here is a real boundary fix, not scope creep.
- Idempotency: the upsert is keyed on `id`, so a redelivered event (retry
  after crash) converges instead of duplicating — same standard the rest of
  the messaging in this project is held to.

### Entity / service changes in `farms`

- `FarmEntity.user` (eager `@ManyToOne(UserEntity)`) → plain scalar column
  `userId: number` (indexed, no cross-engine FK). `UserEntity`'s inverse
  `@OneToMany(() => FarmEntity, ...)` is removed. `farms.entity.ts` no longer
  imports `UserEntity`.
- `ownership.service.ts`: `farm.user?.id` → `farm.userId`,
  `crop.farm?.user?.id` → `crop.farm?.userId`, etc. The `relations: [...,
  '...user']` loads are dropped entirely — the IDOR check never actually
  needed a joined `User` row, only the FK scalar, and removing the eager join
  makes that visible instead of accidental.
- `farms.service.ts`: `user: Equal(userId)` / `user: { id: userId }` →
  `userId: Equal(userId)`.
- `crops.service.ts`: `farm.user?.id` → `farm.userId` for the
  `crop.initialized` outbox payload (no behavior change — it was already only
  the numeric id on the wire).
- `report.service.ts` is rewritten with `FarmEntity` (not `UserEntity`) as the
  query root:
  - Admin-role check (defense in depth against a message placed directly on
    the queue) reads `user_projection` instead of `users`.
  - Admin report: load the farm/crop/activity/harvest tree, group by
    `userId`, attach `{id, firstName, lastName, email, rol}` from
    `user_projection` as owner metadata — replacing today's full `User`
    object (minus password/token).
  - Farmer report: same shape, filtered to `userId = farmer_id` (already
    validated as `farmer_id === req_id` before any query runs).

### Infrastructure

- `docker-compose.yml`: `postgres` → `postgres-auth` + `postgres-farms`
  (separate images/volumes/networks); `auth`/`farms` each get their own
  `POSTGRES_URI`; `postgres_admin` (pgAdmin) registers both.
- `k8s/10-postgres.yaml` → `10-postgres-auth.yaml` + `11-postgres-farms.yaml`
  (StatefulSet + Service + PVC each); `k8s/01-config.yaml` and the Secret
  split into `harvestledger-auth-config/secret` and
  `harvestledger-farms-config/secret`; `21-auth.yaml` / `22-farms.yaml`
  consume their own.
- `helm/values.yaml` / `helm/templates/backends.yaml`: `postgres` →
  `postgres.auth` / `postgres.farms`, template parametrized rather than
  duplicated.
- `.env.example`: `POSTGRES_URI` → `AUTH_POSTGRES_URI` + `FARMS_POSTGRES_URI`.

### Consistency and failure modes (stated, not hidden)

- User creation and its `user_projection` row in `farms` are **eventually
  consistent** — the same trade-off the project already documents for the
  Postgres/MongoDB dual write. A farm created in the gap between `auth`
  publishing `user.created` and `farms` consuming it will reference a
  `userId` not yet present in the local projection; this does not block farm
  creation (no existence check against `user_projection` is added — matching
  today's behavior of not re-validating on every operation).
- If `auth` is down, `farms` keeps serving reports from whatever
  `user_projection` state it already has — stale but not broken. This is the
  concrete advantage of the event-carried read model over the synchronous-RPC
  alternative that was considered and rejected.

## Verification

1. `pg_dump`/inspection: `postgres-farms` has no `users` table; `postgres-auth`
   has no `farms/crops/activities/harvests` tables.
2. Unit: `ownership.service.spec.ts` updated to `farm.userId` (no relations to
   assert); `report.service.spec.ts` rewritten against `FarmEntity` +
   `user_projection`; new spec for the `user.created`/`user.updated` consumer
   (creates, updates, and a duplicate delivery converges instead of
   duplicating).
3. Integration/e2e: farm → crop → activity → harvest flow against
   `postgres-farms` alone; login/registration against `postgres-auth` alone;
   the existing IDOR e2e test (user A requests user B's `cropId` → 403)
   re-verified with zero access to `users`.
4. Consistency drill: create a user, kill `farms` before it consumes
   `user.created`, restart it — the event is still pending in `auth`'s
   outbox (not yet acked) and is redelivered; `user_projection` converges;
   redelivering the same event again does not duplicate the row.
5. `kind` cluster: both Postgres StatefulSets healthy, probes green, full
   `pnpm test` / Swagger smoke run against the two-database topology.

## Out of scope

- The "new service" half of Phase 5 (e.g. notifications) — separate spec once
  this split lands.
- Event sourcing, CQRS, full sagas — unchanged from the roadmap's standing
  position; the outbox covers the write-consistency need here.
