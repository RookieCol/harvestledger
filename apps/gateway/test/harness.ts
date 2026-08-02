import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { StartedTestContainer, GenericContainer, Wait } from 'testcontainers';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer } from '@testcontainers/rabbitmq';
import { RedisContainer } from '@testcontainers/redis';
import { DataSource } from 'typeorm';

/**
 * End-to-end harness: real Postgres, real RabbitMQ, real Redis (Testcontainers),
 * with `gateway`, `auth` and `farms` booted in-process against them.
 *
 * Nothing on the request path is mocked. A request goes
 *   supertest → gateway (HTTP) → RabbitMQ → auth/farms → Postgres
 * exactly as it does in the cluster, which is the only way an authorization
 * test proves anything: the IDOR check lives in `farms`, three hops from the
 * HTTP layer that is supposed to enforce it.
 *
 * Not booted: `tracing` (MongoDB-backed, off the authorization path). The
 * outbox relay in `farms` still publishes `crop.initialized` to the tracing
 * queue — it just accumulates there unconsumed, which is the correct
 * behaviour to exercise anyway.
 */
export interface E2EHarness {
  gateway: INestApplication;
  /** Truncates the domain tables between tests without re-running migrations. */
  reset: () => Promise<void>;
  teardown: () => Promise<void>;
}

// Pulling four images and booting three Nest apps is slow the first time.
export const HARNESS_BOOT_TIMEOUT_MS = 240_000;

export async function startHarness(): Promise<E2EHarness> {
  const containers: StartedTestContainer[] = [];

  // One Postgres per service, as in production — auth and farms no longer
  // share an instance, so the harness must not let them share one either.
  const postgresAuth = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harvestledger_auth')
    .withUsername('user')
    .withPassword('password')
    .start();

  const postgresFarms = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harvestledger_farms')
    .withUsername('user')
    .withPassword('password')
    .start();

  const rabbitmq = await new RabbitMQContainer('rabbitmq:3.13-alpine').start();

  const redis = await new RedisContainer('redis:7-alpine').start();

  // Real SMTP sink: `auth.register()` sends a welcome email. The service
  // swallows send failures, so a mock would hide a genuine break; pointing at
  // a throwaway MTA keeps the path real and fast.
  const mailpit = await new GenericContainer('axllent/mailpit:latest')
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  containers.push(rabbitmq, redis, mailpit);

  const authPostgresUri = postgresAuth.getConnectionUri();
  const farmsPostgresUri = postgresFarms.getConnectionUri();
  const rabbitUrl = new URL(rabbitmq.getAmqpUrl());

  // The apps read process.env at module-import time (RabbitmqModule.registerRmq
  // is evaluated when the module file is loaded), so the environment must be
  // complete BEFORE the dynamic imports below.
  Object.assign(process.env, {
    RABBITMQ_USER: rabbitUrl.username || 'guest',
    RABBITMQ_PASS: rabbitUrl.password || 'guest',
    RABBITMQ_HOST: `${rabbitUrl.hostname}:${rabbitUrl.port}`,
    RABBITMQ_AUTH_QUEUE: 'auth_queue_e2e',
    RABBITMQ_FARMS_QUEUE: 'farms_queue_e2e',
    RABBITMQ_TRACING_QUEUE: 'tracing_queue_e2e',

    AUTH_POSTGRES_URI: authPostgresUri,
    FARMS_POSTGRES_URI: farmsPostgresUri,
    // Each service's migrations are run explicitly below, before any app
    // boots, so no app migrates its own database on startup here.
    DB_RUN_MIGRATIONS: 'false',
    MONGO_URI: 'mongodb://unused:27017/harvestledger',
    REDIS_URL: redis.getConnectionUrl(),

    JWT_SECRET: 'e2e-jwt-secret',
    JWT_REFRESH_SECRET: 'e2e-jwt-refresh-secret',

    S3_REGION: 'us-east-1',
    S3_BUCKET: 'harvestledger-e2e',
    S3_ACCESS_KEY_ID: 'e2e',
    S3_SECRET_ACCESS_KEY: 'e2e',

    MAIL_HOST: mailpit.getHost(),
    MAIL_PORT: String(mailpit.getMappedPort(1025)),
    MAIL_SECURE: 'false',
    MAIL_IGNORE_TLS: 'true',
    MAIL_USER: 'e2e@harvestledger.test',
    MAIL_PASS: '',
    MAIL_SERVICE: '',

    CORS_ORIGINS: 'http://localhost:3000',
    LOG_LEVEL: 'error',
    // The gateway's per-pod throttle would reject a burst of test requests.
    THROTTLE_LIMIT: '10000',
    // Skip the admin seed: it needs ADMIN_EMAIL/ADMIN_PASSWORD and is not
    // part of any path under test.
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD: '',
  });

  // Imported dynamically, after the environment is in place.
  const {
    UserEntity,
    FarmEntity,
    CropEntity,
    ActivitiesEntity,
    HarvestEntity,
    OutboxEntity,
    UserProjectionEntity,
    configureRmqMicroservice,
  } = await import('@app/common');
  const { migrations: authMigrations } =
    await import('../../auth/src/db/migrations');
  const { migrations: farmsMigrations } =
    await import('../../farms/src/db/migrations');

  // Run the real migrations — the same ordered lists production runs, one per
  // service database — rather than `synchronize: true`. A schema the
  // migrations cannot produce is a schema that does not exist.
  const authDataSource = new DataSource({
    type: 'postgres',
    url: authPostgresUri,
    entities: [UserEntity, OutboxEntity],
    migrations: authMigrations,
    synchronize: false,
  });
  await authDataSource.initialize();
  await authDataSource.runMigrations();

  const farmsDataSource = new DataSource({
    type: 'postgres',
    url: farmsPostgresUri,
    entities: [
      FarmEntity,
      CropEntity,
      ActivitiesEntity,
      HarvestEntity,
      OutboxEntity,
      UserProjectionEntity,
    ],
    migrations: farmsMigrations,
    synchronize: false,
  });
  await farmsDataSource.initialize();
  await farmsDataSource.runMigrations();

  const { AuthModule } = await import('../../auth/src/auth.module');
  const { FarmsModule } = await import('../../farms/src/farms.module');
  const { GatewayModule } = await import('../src/gateway.module');
  const { configureGateway } = await import('../src/setup');

  // --- auth and farms: RabbitMQ consumers, no HTTP port bound -------------
  const auth = await NestFactory.create(AuthModule, { logger: false });
  configureRmqMicroservice(auth, process.env.RABBITMQ_AUTH_QUEUE);
  await auth.startAllMicroservices();
  await auth.init();

  const farms = await NestFactory.create(FarmsModule, { logger: false });
  configureRmqMicroservice(farms, process.env.RABBITMQ_FARMS_QUEUE);
  await farms.startAllMicroservices();
  await farms.init();

  // --- gateway: HTTP, driven by supertest via getHttpServer() -------------
  const gateway = await NestFactory.create(GatewayModule, { logger: false });
  configureGateway(gateway);
  await gateway.init();

  const reset = async () => {
    // RESTART IDENTITY so ids are predictable per test; CASCADE because the
    // farm → crop → activity/harvest chain is FK-linked. Each database is
    // truncated through its own connection.
    await farmsDataSource.query(
      'TRUNCATE TABLE activities, harvests, crops, farms, outbox, user_projection RESTART IDENTITY CASCADE',
    );
    await authDataSource.query(
      'TRUNCATE TABLE outbox, users RESTART IDENTITY CASCADE',
    );
  };

  const teardown = async () => {
    await gateway.close();
    await farms.close();
    await auth.close();
    await farmsDataSource.destroy();
    await authDataSource.destroy();
    await Promise.all([
      postgresAuth.stop(),
      postgresFarms.stop(),
      ...containers.map((container) => container.stop()),
    ]);
  };

  return { gateway, reset, teardown };
}
