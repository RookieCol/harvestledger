# Phase 0 — Remove blockchain/IPFS, add MongoDB event history

**Status:** approved, ready for planning
**Roadmap reference:** [ROADMAP.md § Phase 0](../../../ROADMAP.md#phase-0--remove-blockchain-and-ipfs)

## Why

The traceability chain (NFT-style metadata on IPFS + ERC-721 mint on Polygon) is the pattern the industry retreated from between 2023 and 2026 (see [README § Architecture decisions](../../../README.md#architecture-decisions--why-blockchain-was-removed)). Phase 0 removes it and replaces the auditable-history property it provided with an append-only event history in MongoDB, owned by the `tracing` service — keeping the property, dropping the external dependency, and giving the project its document-store showcase for the polyglot-persistence goal.

## Current state (audit)

- `apps/tracing/src/tracing.service.ts` — blockchain wiring (`ethers.JsonRpcProvider`/`Wallet`/`Contract` built eagerly from `cropABI.json` + `WALLET_PRIVATE_KEY`/`CONTRACT_ADDRESS`/`BLOCKCHAIN_RPC_URL`), `pinMetadataToIpfs`, `formatCropMetadata`, `uploadImageToPinata`, `convertToBlob`, `mintNft`, and the orchestrators `initTracing`/`updateTracing`. ~10 commented-out `console.log` blocks plus 5 live `console.log`/`console.error` calls.
- `apps/tracing/src/tracing.controller.ts` — RMQ-only, 3 `@MessagePattern`s: `gethello` (unguarded at the gateway too), `initTracing`, `updateTracing`.
- `apps/tracing/src/tracing.module.ts` and `tracing.service.ts` import `CropsService`/`HarvestService` directly from `apps/farms/src/...` — the compile-time coupling the README flags — and register the same TypeORM entities against the same Postgres instance as `farms`.
- Pinata-calling logic is duplicated three times: `tracing.service.ts`, `apps/farms/src/harvests/harvests.service.ts` (`getMetadataPinata`, `setMetadataPinata`, `formatActivityMetadata`, duplicate `findCropById`/`updateCropTracing`), and `apps/farms/src/activities/activities.service.ts` (same shape).
- `CropEntity` (`libs/common/src/entities/crops.entity.ts`) has `metadataLink` and `nftId` columns, read/written across `tracing.service.ts` and the two `farms` services above. No DTO exposes either field. No report or other consumer reads them.
- `apps/gateway/src/controllers/tracing.controller.ts` exposes `GET tracing/getHello` (unguarded), `PUT tracing/initTracing`, `POST tracing/updateTracing/:id` (multer disk upload), plus one dead commented-out route.
- Crops already have an independent, S3-backed photo endpoint (`apps/gateway/src/controllers/crops.controller.ts` `POST/GET photo`) — unrelated to tracing's IPFS image flow.
- No MongoDB wiring exists anywhere in the repo today (no dependency, no `docker-compose.yml` service, no env vars, no schema). Phase 0 adds it from scratch.

## Design

### Architecture

`tracing` becomes a pure event sink with no dependency on `farms`'s source tree and no blockchain/Pinata code. `crops`, `activities`, and `harvests` services (in `farms`) each emit a fire-and-forget RabbitMQ event right after their own Postgres write succeeds; `tracing` consumes those events and inserts one document per event into MongoDB. Removing the read/decision logic that `tracing` used to need (mint-gating on harvest existence, refetching crop state) is what allows dropping the `tracing → farms` compile-time import entirely — a Phase 1 roadmap item that falls out of this design as a side effect, not something pulled forward on purpose.

### New MongoDB module

- `libs/common/src/modules/mongo.module.ts` — wraps `MongooseModule.forRoot(...)`, mirroring the shape of the existing `libs/common/src/modules/db.module.ts` (Postgres).
- New dependencies: `@nestjs/mongoose`, `mongoose`.
- New `.env.example` entries for Mongo connection (host/port/db/credentials or a single `MONGO_URI`).
- New `mongo` service block in `docker-compose.yml`, alongside the existing `postgres`/`postgres_admin` pattern.

### Event schema

One collection, one Mongoose schema, discriminated by `eventType` — not one schema per event type:

```ts
{
  eventType: 'CROP_INITIALIZED' | 'ACTIVITY_CREATED' | 'HARVEST_CREATED',
  cropId: number,
  farmId: number,
  userId: number,
  payload: Mixed,       // snapshot of the relevant entity at event time
  occurredAt: Date,
}
```

Lives at `libs/common/src/schemas/tracing-event.schema.ts`.

### `tracing` service rewrite

Remove:
- `ethers` import, `cropABI.json`, all module-level blockchain wiring.
- `pinMetadataToIpfs`, `formatCropMetadata`, `uploadImageToPinata`, `convertToBlob`, `mintNft`.
- The `gethello` message pattern (and its unguarded gateway route).
- The `CropsService`/`HarvestService` imports in both `tracing.service.ts` and `tracing.module.ts`, and the duplicated TypeORM entity registrations tied to those imports.
- The `ethers` dependency from `package.json`.

Add:
- Three `@EventPattern` handlers: `crop.initialized`, `activity.created`, `harvest.created` — each persists the incoming payload as a `TracingEvent` document, acking only after the Mongo write succeeds.
- One `@MessagePattern({ cmd: 'getTracingHistory' })` — queries `TracingEvent` by `cropId`, sorted by `occurredAt`, and returns the array.

### `farms` changes

- `crops.service.ts` — emit `crop.initialized` (fire-and-forget, via `client.emit`, not `send`) immediately after a new crop is saved. This replaces the previously-explicit `initTracing` client action: the event now fires automatically as part of crop creation, so no separate trigger call is needed.
- `activities.service.ts` — delete `getMetadataPinata`, `setMetadataPinata`, `formatActivityMetadata`, and the duplicated `findCropById`/`updateCropTracing`. After `createActivity` saves, emit `activity.created` with a snapshot of the created activity.
- `harvests.service.ts` — same deletions, and after `createHarvest` saves, emit `harvest.created` with a snapshot of the created harvest.

### `CropEntity`

Remove the `metadataLink` and `nftId` columns. Since real migrations are explicitly a Phase 1 item and the project still runs on `synchronize: true`, this Phase 0 change is just the entity-field removal — no separate migration script.

### Gateway (`apps/gateway/src/controllers/tracing.controller.ts`)

- Remove `GET tracing/getHello`, `PUT tracing/initTracing` (auto-fires now), `POST tracing/updateTracing/:id` (its only purpose — pin image + gate mint — no longer exists; crops already have their own S3 photo endpoint), and the dead commented-out route.
- Add `GET tracing/history/:cropId` (guarded the same way other resource routes are today — resource-level IDOR hardening stays a Phase 1 concern, consistent with the rest of the current codebase) — proxies `{ cmd: 'getTracingHistory' }` and returns the crop's event array. This makes the new Mongo-backed history actually visible through Swagger instead of only verifiable via a DB client, while staying a minimal read-only addition.

### README

Update the architecture diagram (drop the `IPFS`/`Polygon` legacy nodes and legend), the API table (drop the old tracing routes, add the new history route), and the "Where it's going" Phase 0 bullet to reflect what's now done, per the roadmap's own guiding principle of keeping the README honest as phases land.

## Data flow

1. Client creates a crop → `crops.service.ts` saves to Postgres → emits `crop.initialized` (non-blocking) → `tracing` consumer writes a Mongo document.
2. Same pattern for activity and harvest creation.
3. Client calls `GET tracing/history/:cropId` → gateway → `tracing` → Mongo query sorted by `occurredAt` → array of events returned.

## Error handling

Events are fire-and-forget (`client.emit`, not `send`): a `tracing` outage does not block crop/activity/harvest creation. This is the same dual-write honesty the roadmap already calls out for Postgres+Mongo — idempotency, DLQ, and retries to make this durable are explicitly Phase 1 scope, not attempted here. `tracing`'s new event handlers ack only after the Mongo write succeeds (a small, contained preview of the Phase 1 "ack after processing" fix, scoped only to this new code — the existing 43 ack-before-processing call sites elsewhere are untouched, still Phase 1's job).

## Testing

Manual verification per the roadmap's own Phase 0 checklist: `docker compose up --build` with no Pinata/blockchain env vars set; the farm → crop → activity → harvest flow works end to end via Swagger; each activity (and crop init, and harvest) produces a document in the MongoDB event history, confirmed via a Mongo client and via the new `GET tracing/history/:cropId` route. No automated test suite yet — `.spec.ts` coverage and CI are Phase 1's job.

## Explicitly out of scope for Phase 0

- Real Postgres migrations (still `synchronize: true` until Phase 1).
- Idempotency / DLQ / retries / ack-after-processing for the *existing* 43 call sites (Phase 1).
- Resource-ownership (IDOR) guards on the new history route beyond what the rest of the codebase already does (Phase 1).
- Unifying file storage to S3-only (Phase 1) — no file-upload code is being added here to unify.
- `.spec.ts` tests and CI (Phase 1).
