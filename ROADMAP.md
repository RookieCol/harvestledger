# Roadmap and technical debt

An honest inventory of where the project stands. Ordered by impact, not by effort.

Items marked ✅ were already fixed while preparing the repository for publication.

---

## Security

- [x] **Hardcoded secrets.** The wallet private key, the contract address, and the RPC URL were written into `tracing.service.ts`. They are now read from the environment, and the service fails fast if any is missing.
- [x] **Hardcoded privileged account.** The seed promoted a specific email address, written in the source, to `admin`. The administrator is now defined solely by `ADMIN_EMAIL`.
- [x] **Inactive input validation.** The DTOs used `class-validator`, but no global `ValidationPipe` was ever registered, so not a single decorator ran. It is now active with `whitelist` and `forbidNonWhitelisted`.
- [x] **Hardcoded frontend domain.** The password-reset email pointed at a fixed host; it now comes from `FRONTEND_URL`.
- [ ] **Resource ownership checks (IDOR).** Most `farms`/`crops`/`activities`/`harvests` endpoints verify the JWT but not that the resource belongs to the caller: passing someone else's `farmId` reaches another producer's data. This is the most serious open issue.
- [ ] **Ad-hoc role authorization.** The role is a free-form `string`, and the only check (`rol !== 'admin'`) is written by hand inside `ReportService`. A `RolesGuard` with a `@Roles()` decorator and a role enum is missing.
- [ ] **No refresh-token rotation or revocation.** `refreshToken()` reissues the access token without invalidating the refresh token it just consumed. A leaked refresh token stays valid for 7 days.
- [ ] `FarmEntity.name` is globally unique rather than unique per user, so one producer can squat farm names on everyone else.

## Reliability

- [x] **`PATCH /activities` hung the request.** The endpoint was exposed on the gateway while its handler was commented out, so the message was never answered and the client waited until timeout. Handler restored.
- [x] **The `tracing` service didn't compile.** `resolveJsonModule` was missing from `tsconfig.json`, which is required to import the ABI. All four services build now.
- [ ] **Ack before processing.** Every handler calls `acknowledgeMessage()` up front, so a later failure loses the message for good. It should acknowledge after successful processing, with a DLQ and retries added.
- [ ] **Non-transactional writes across DB and IPFS.** If Pinata fails after the activity is saved to Postgres, the metadata drifts out of sync with no compensation. This needs an outbox or idempotent retries.
- [ ] **Race condition when reading the `tokenId`.** After minting, the code runs `queryFilter('Transfer')` across the whole history and takes the last event, which may be someone else's mint. It should be read from the transaction's own receipt.
- [ ] **Hardcoded fixed `gasPrice`** (1000 gwei): overpays or fails depending on network congestion.
- [ ] Uploaded files land in `uploads/` on local disk, which prevents scaling beyond a single instance.
- [ ] No global exception filter: services return `{status:'error'}` with HTTP 200, and status codes are inconsistent between `farms` and `tracing`.

## Quality and architecture

- [ ] **Test coverage: 0%.** Only the four NestJS boilerplate `app.e2e-spec.ts` files exist, and `testRegex` doesn't even pick them up. Priority: unit tests for the traceability flow and e2e tests for authentication.
- [ ] **No CI.** A workflow running lint, build, and tests on every push is missing.
- [ ] **Coupling between microservices.** `tracing` imports `CropsService` and `HarvestService` from `farms` via a relative path (`../../farms/src/...`) instead of going through RabbitMQ, which breaks isolation. All three services also share a single database.
- [ ] **Duplicated traceability logic.** `getMetadataPinata`, `pinMetadataToIpfs`, and `formatActivityMetadata` are copy-pasted across `activities`, `harvests`, `crops`, and `tracing`. They belong in one shared module.
- [ ] **Unused repository layer.** `libs/common/src/repositories` defines a Base pattern almost nobody consumes: in `farms` the `CropsRepositoryInterface`, `ActivitiesRepository`, and `HarvestRepository` tokens all point at `FarmsRepository` by copy-paste, while the services use `@InjectRepository` directly. Either adopt it or delete it.
- [ ] **`synchronize: true` in TypeORM**, with the "shouldn't be used in production" warning sitting in the code itself. It should move to the migration workflow already wired into the scripts.
- [ ] Some `console.log` calls remain in production code; the Nest `Logger` should be used consistently.
- [ ] Inverse relations are declared incorrectly on the entities (`(x) => x.id` instead of the relational property). TypeORM tolerates it, but it's wrong.
- [ ] The report is exported with `workbook.csv.write()` and a `.csv` header despite using ExcelJS: either emit a real `.xlsx` or drop the dependency.
- [ ] Contract typos: `CreateHarvestDto.categroy`, `@IsNumber()` applied to a `string`, and `activitiesByFarm` actually querying by `cropId`.
- [ ] `GET /tracing/getHello` is a public test endpoint that should be removed.

## Product

- [ ] Public traceability lookup by QR code, so the end consumer can verify a batch without an account.
- [ ] Move metadata reads to a self-hosted IPFS gateway or local CID verification, instead of depending on Pinata's gateway.
- [ ] Internationalization: metadata attributes and report headers are currently hardcoded in a single language.
