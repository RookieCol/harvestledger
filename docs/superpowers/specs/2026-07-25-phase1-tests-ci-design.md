# Phase 1 (slice 1) — Tests + CI foundation

**Status:** approved (option A), implementing
**Roadmap reference:** [ROADMAP.md § Phase 1 — Stable, "Tests and CI"](../../../ROADMAP.md#phase-1--stable)

## Why

The roadmap makes tests + CI the floor: "Nothing below is verifiable until that is fixed." Today there are **zero** `.spec.ts` files, the four `app.e2e-spec.ts` scaffolds still assert `GET / → 'Hello World!'` (a route that never existed under `api/v1`), the `test:e2e` script points at `apps/harvestledger/` (a directory that does not exist), and there is no `.github/`. This slice establishes real unit tests, a green CI, and a pre-commit hook — without pulling in infrastructure.

## Scope decision (option A)

Real end-to-end tests need the full stack alive (only `gateway` speaks HTTP; `auth`/`farms`/`tracing` are RabbitMQ `@MessagePattern` services). Running that in CI means `docker compose up` on top of the **known-broken Dockerfiles** (`FROM node` untagged, lockfile not copied → non-reproducible installs) — which is Phase 3 work. Rather than drag a half-done Phase 3 into Phase 1, **this slice is infra-free**:

- **In scope:** unit tests (mocked deps, no real DB/broker/S3), lint, build, coverage, GitHub Actions, Husky + lint-staged.
- **Deferred to Phase 3:** real e2e against the compose stack (when the Dockerfiles, health probes, and reproducible images actually exist). The broken e2e scaffolds are removed now; `test:e2e` is repointed to a valid config that passes with no tests, documented as Phase 3's job.

## Components

### Unit tests (direct instantiation + typed mocks)

Pure unit tests — instantiate each service with hand-mocked dependencies (`new Service(mockRepo, mockJwt, ...)`), no `Test.createTestingModule` DI wiring, no real infrastructure.

- `apps/auth/src/auth.service.spec.ts`
  - `hashPassword` / `doesPasswordMatch` round-trip (real bcrypt, cheap).
  - `validateUser`: returns user on match; returns falsy on unknown user and on password mismatch.
  - `login`: returns access+refresh tokens for valid creds; throws `UnauthorizedException` for invalid.
  - `refreshToken`: reissues on valid token; throws on missing/invalid.
  - `forgotPassword`: stores a hashed token and sends the email; `resetPassword`: valid token path, invalid token, expired token.
- `apps/farms/src/crops/crops.service.spec.ts`
  - `createCrop`: saves and emits `crop.initialized` with `cropId`/`farmId`/`userId` resolved from the farm + its owning user.
  - `findCropById`, `updateCrop` (found / not-found), `deleteCrop` (found / not-found).
- `apps/farms/src/activities/activities.service.spec.ts`
  - `createActivity`: saves and emits `activity.created` with ids resolved via `crop.farm.user`.
- `apps/farms/src/harvests/harvests.service.spec.ts`
  - `createHarvest`: rejects when a harvest already exists; otherwise saves and emits `harvest.created`.
- `apps/tracing/src/tracing.service.spec.ts`
  - `recordEvent`: builds the document with the right `eventType`/ids/`payload`/`occurredAt` and saves it.
  - `getHistory`: queries by `cropId`, sorted by `occurredAt`.

Tests assert **current** behavior. Where a service has a known bug (e.g. broken DTOs), that is the Validation slice's job — not codified as "correct" here, just not exercised.

### Jest coverage configuration

The existing `collectCoverageFrom: ["**/*.(t|j)s"]` collects everything (entities, DTOs, `main.ts`, modules) — a global threshold over it is meaningless. Fix:

- Narrow `collectCoverageFrom` to service logic: include `apps/**/*.service.ts` and `libs/**/*.ts`, exclude `*.module.ts`, `main.ts`, `*.entity.ts`, `**/dtos/**`, `*.spec.ts`, `**/db/**`, `*.interface.ts`, schemas, and `**/*.abstract*`.
- Set `coverageThreshold` **per-path** on the five tested files (a real floor, e.g. 70–80% lines) rather than a hollow global number. Exact percentages are calibrated against the coverage the tests actually produce, then set just below it to leave headroom.

### `test:e2e` and broken scaffolds

- Delete `apps/{gateway,auth,farms,tracing}/test/app.e2e-spec.ts` (all four assert a nonexistent `GET / → 'Hello World!'`).
- Repoint the `test:e2e` script to a valid Jest e2e config that runs with `--passWithNoTests`, so the script exists and is green until Phase 3 adds real e2e.

### GitHub Actions (`.github/workflows/ci.yml`)

- Triggers: `push` and `pull_request`.
- Runner: `ubuntu-latest`, Node 24 (matching `@types/node`), pnpm via `pnpm/action-setup` + `actions/setup-node` with pnpm cache.
- Steps: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`, `pnpm test:cov`.
- No service containers, no docker — everything runs in-process against mocks.

### Husky + lint-staged

- Husky v9: `prepare` script (`husky`) + `.husky/pre-commit` running `pnpm lint-staged`.
- `lint-staged` config: `*.ts` → `eslint --fix` + `prettier --write` on staged files only.

## Verification

- `pnpm test:cov` green locally, per-path thresholds met.
- `pnpm lint` and `pnpm build` green.
- `pnpm test:e2e` green (no tests, exits 0).
- A staged bad-format `.ts` file is auto-fixed by the pre-commit hook.
- CI is green on the pushed branch (the roadmap's Phase 2 badge builds on this).

## Explicitly out of scope for this slice

- Real e2e / any Docker/infra in CI (Phase 3, once Dockerfiles are fixed).
- ValidationPipe in the microservices and the broken-DTO fixes (next Phase 1 slice: Validation).
- Global exception filter, IDOR/security, reliable messaging, migrations (later Phase 1 slices).
