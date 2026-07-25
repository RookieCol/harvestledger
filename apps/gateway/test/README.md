# End-to-end tests

Real e2e tests are **deferred to Phase 3** of the roadmap.

Only `gateway` speaks HTTP; `auth`, `farms` and `tracing` are RabbitMQ
`@MessagePattern` services. A meaningful e2e therefore needs the whole stack
alive (broker + Postgres + MongoDB + all four services), which in turn depends
on the hardened, reproducible Docker images and health probes that Phase 3
delivers. Running it on today's dev-oriented Dockerfiles (`FROM node`
untagged, lockfile not copied) would be non-reproducible.

Until then, `pnpm test:e2e` runs against this config and passes with no tests
(`--passWithNoTests`). The e2e suite that exercises
register → login → farm → crop → activity → harvest → `GET tracing/history/:cropId`
will live here once Phase 3 lands.
