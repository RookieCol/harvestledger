# Phase 1 (slice 4a) — Resource authorization (IDOR)

**Status:** implemented
**Roadmap reference:** [ROADMAP.md § Phase 1 — Stable, "Security"](../../../ROADMAP.md#phase-1--stable)

## Why

The most serious hole: every crop/activity/harvest operation was addressed by
`id` only, with no owner check. Any authenticated user could read, modify,
delete, or upload photos onto **another user's** resources by supplying their
ids. The gateway attached `req.user` but only forwarded the id for a couple of
operations, and no service ever verified ownership.

## Design

### OwnershipService (`apps/farms/src/ownership`)
Resolves and enforces the chain `User ──< Farm ──< Crop ──< Activity/Harvest`.
`FarmEntity.user` is eager, so loading the `farm` relation brings the owner.
Four methods — `assertFarmOwner`, `assertCropOwner`, `assertActivityOwner`,
`assertHarvestOwner` — each load the resource with the relations needed to reach
`…farm.user.id` and:
- throw `NotFoundException` (404) when the resource does not exist,
- throw `ForbiddenException` (403) when it exists but belongs to another user,
- otherwise return the loaded entity (reused by the caller to avoid a 2nd query).

The distinct 404-vs-403 is deliberate: a missing resource is not the same as
someone else's.

### userId threaded end to end
The gateway forwards `req.user.id` on every crop/activity/harvest/farm
operation (create, read-by-id, list-by-parent, update, delete, upload/get
photo). The farms `@MessagePattern` handlers destructure `userId` from the
payload; each service method takes `userId` as its first argument and calls the
matching `assert…Owner` before doing anything. Create paths assert ownership of
the **parent** (a crop is created under a farm the user owns; an
activity/harvest under a crop the user owns).

## Bugs fixed along the way
- `farms.controller.updateFarm` had a `try/catch` that swallowed failures and
  returned **nothing** (undefined) to the client — removed.
- Removed the PII `console.log`s in `farms.getFarmImage` (controller + service).
- Fixed the `updateHarvest` handler: `harvestId` was an undecorated parameter
  (always `undefined`) and the service double-nested `updateHarvestDto` — both
  corrected as the payload now carries `{ userId, updateHarvestDto, harvestId }`.

## Verification
- `pnpm build`, `pnpm lint:check`, `pnpm test:cov` green (44 tests, ~72% coverage).
- Service specs assert the ownership check is called and that a
  Forbidden/NotFound from it propagates (save/remove not reached).

## Out of scope (next security slices)
- `RolesGuard` + role enum (replacing the hand-written `user.rol !== 'admin'`
  null-deref) and the `report.service` authorization — slice 4b.
- helmet, `@nestjs/throttler`, explicit CORS, env schema validation, Bearer
  scheme validation — slice 4c.
- Redis-backed refresh-token rotation/revocation — deferred to the Redis slice.
