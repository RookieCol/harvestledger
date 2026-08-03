# End-to-end tests

```bash
pnpm test:e2e     # requires a running Docker daemon
```

Nothing on the request path is mocked. `harness.ts` starts **real** backing
services with [Testcontainers](https://testcontainers.com/) — Postgres,
RabbitMQ, Redis and an SMTP sink (mailpit) — then boots `gateway`, `auth` and
`farms` in-process against them. A request travels

```
supertest → gateway (HTTP) → RabbitMQ → auth / farms → Postgres
```

exactly as it does on the cluster.

Three details make this a real e2e rather than a decorated integration test:

- **The schema comes from the real migrations.** The harness runs the same
  ordered `migrations` list production runs, not `synchronize: true`. A schema
  the migrations cannot produce is a schema that does not exist.
- **The request pipeline is the production one.** `configureGateway()`
  (`apps/gateway/src/setup.ts`) and `configureRmqMicroservice()`
  (`libs/common/src/rmq/`) are shared with each service's `main.ts`, so the
  tests exercise the same helmet/CORS/prefix/`ValidationPipe`/exception-filter
  and the same ack-after-processing interceptor. A harness that wired its own
  would drift from production silently — and pass while doing it.
- **Fixtures are created through the public API.** No direct database seeding,
  so ownership rows are written by the code path production uses.

`tracing` is not booted: it is MongoDB-backed and off the authorization path.
The `farms` outbox relay still publishes `crop.initialized` to the tracing
queue, where it accumulates unconsumed — which is the correct behaviour to
exercise anyway.

## Suites

| File               | What it proves                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idor.e2e-spec.ts` | Resource-ownership enforcement (IDOR). User A is refused every one of user B's farms, crops, activities and harvests — read, update, delete, and creating a crop inside B's farm. Includes the control group (B _can_ reach their own), that a missing resource is a 404 rather than a 403, and that a missing or forged token is a 401. |

The `register → login → farm → crop → activity → harvest → GET tracing/history/:cropId`
happy-path suite is the natural next addition; it needs MongoDB and `tracing`
added to the harness.

## Cost

First run pulls four images. Subsequent runs reuse them. The suite runs
`--runInBand` with a 240s timeout because the containers and three Nest apps
boot once per file.
