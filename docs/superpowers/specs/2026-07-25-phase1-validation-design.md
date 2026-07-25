# Phase 1 (slice 2) — Validation

**Status:** implemented
**Roadmap reference:** [ROADMAP.md § Phase 1 — Stable, "Validation"](../../../ROADMAP.md#phase-1--stable)

## Why

Validation only ran at the gateway, so a message crafted straight onto a queue
reached the `@MessagePattern` handlers unchecked. Several DTOs were also broken
(wrong types, missing decorators, a contradiction, a missing key), and the
create-activity / create-harvest flow was inconsistent between the DTO
(`cropId`) and the service (`crop.id`).

## Changes

### Validation everywhere
- Declare `class-transformer` as a direct dependency (it was used via
  `transform: true` but only present transitively).
- New shared `buildValidationPipe()` in `libs/common` (whitelist +
  forbidNonWhitelisted + transform), used by the gateway **and** registered on
  the three microservices (auth, farms, tracing) via `app.useGlobalPipes(...)`
  before `startAllMicroservices()`. Primitive/inline `@Payload()` params are
  passed through untouched; only DTO-class payloads are validated.

### Broken DTOs fixed
- `createHarvestDto`: `@IsNumber() categroy: string` → `@IsString() category`
  (typo + wrong type; the entity column is `category`). `description` made
  optional to match the nullable column.
- `resetPassword.dto`: had no decorators → `token` `@IsString()@IsNotEmpty()`,
  `newPassword` `@IsString()@MinLength(8)`.
- `createActivityDto`: was all-optional with no crop key → added required
  `@IsNumber() cropId`.
- `createUserDto`: `lastName` had both `@IsNotEmpty()` and `@IsOptional()` →
  resolved to required (consistent with `firstName`).

### cropId → relation contract
- The create-activity/harvest contract is now `cropId` in the body (already
  what `createHarvestDto` declared). The services destructure `cropId` and map
  it to the `crop: { id: cropId }` relation on `create(...)`, and read `cropId`
  directly instead of the previously-assumed `crop.id`. This fixes the live
  break where the DTO carried no `crop` object but the service dereferenced
  `newX.crop.id`. Affected unit tests updated to the new contract.

### Gateway typing/coercion
- `@Body() updateActivityDto: any` → `UpdateActivityDto`.
- `ParseIntPipe` added to every numeric `@Query`/`@Param` across the gateway
  controllers (cropId, farmId, activityId, harvestId, id) — query/route values
  arrive as strings otherwise.
- Cleaned the leftover Swagger description that still mentioned IPFS/Polygon.

## Verification
- `pnpm build`, `pnpm lint:check`, `pnpm test:cov` all green (32 tests).
- `pnpm install --frozen-lockfile` clean.

## Out of scope (later Phase 1 slices)
- Global exception filter / RPC error mapping (409/404/401 currently returning
  200).
- Validating the inline `{ updateXDto, id }` payloads on the microservice update
  handlers (they are not DTO classes).
- IDOR/security, reliable messaging, migrations.
