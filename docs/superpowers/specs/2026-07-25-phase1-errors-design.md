# Phase 1 (slice 3) — Coherent errors

**Status:** implemented
**Roadmap reference:** [ROADMAP.md § Phase 1 — Stable, "Errors"](../../../ROADMAP.md#phase-1--stable)

## Why

There was not a single `@Catch` in the repo, and the gateway controllers
`return service.send(...)` directly, so a service that returned
`{ status: 'error' }` surfaced as **HTTP 200**. A crafted or genuinely-failing
request got a 200 with an error body. One service also leaked the raw error
object to the client, and two `console.log`s leaked PII.

## Design

### Error propagation infrastructure
- **`RpcExceptionFilter`** (microservice-side, `libs/common/src/filters`): a
  thrown domain exception (`NotFoundException`, `ConflictException`, …) is
  serialized into a plain `{ statusCode, message }` that travels back over
  RabbitMQ. Registered on auth, farms and tracing before `startAllMicroservices()`.
- **`HttpExceptionFilter`** (gateway-side, `@Catch()`): one JSON error shape
  `{ statusCode, message, path }`, restoring the real HTTP status from either a
  local `HttpException` (e.g. ValidationPipe → 400) or a microservice-propagated
  `{ statusCode }`. 5xx are logged.
- Both filters are unit-tested.

### Services throw instead of returning error values
Converted across `auth`, `farms`, `crops`, `activities`, `harvests`:
- not-found (update/delete/get-by-id/get-photo) → `NotFoundException` (404)
- duplicate (register, farm name, second harvest) → `ConflictException` (409)
- invalid credentials / token → `UnauthorizedException` / `BadRequestException`
- swallow-and-mask `try/catch` blocks removed so real failures propagate as 500
  through the filters instead of a masked `{ status: 'error' }` with 200.

### Bug/security fixes folded in
- `farms.service.updateFarm` no longer returns the raw `error` object to the
  client (information disclosure).
- Removed the PII `console.log`s in `auth.resetPassword` and
  `farms.getFarmImage`.
- `forgotPassword` returns a generic message whether or not the email exists
  (prevents user enumeration).
- Fixed the copy-pasted "Harvest not found" message in `uploadActivityPhoto`.
- `findHarvestByCropId` treats an empty result as a valid empty list (200), not
  an error.

## Verification
- `pnpm build`, `pnpm lint:check`, `pnpm test:cov` green (40 tests, coverage ~68%).
- Filters covered by unit tests; affected service tests updated to assert thrown
  exceptions.

## Out of scope (deferred)
- `report.service` error handling — coupled to the IDOR/authorization check
  (Security slice) and the N+1 rework (Phase 4).
- ack-after-processing / DLQ / retries (Reliable messaging slice).
- Validating the inline `{ updateXDto, id }` update payloads at the microservice.
