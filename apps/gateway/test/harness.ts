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

  const postgres = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('harvestledger')
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

  const postgresUri = postgres.getConnectionUri();
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

    POSTGRES_URI: postgresUri,
    // Migrations are run explicitly below, once, before any app boots — so
    // auth and farms cannot race each other to migrate.
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
    migrations,
    UserEntity,
    FarmEntity,
    CropEntity,
    ActivitiesEntity,
    HarvestEntity,
    OutboxEntity,
    configureRmqMicroservice,
  } = await import('@app/common');

  // Run the real migrations — the same ordered list production runs — rather
  // than `synchronize: true`. A schema the migrations cannot produce is a
  // schema that does not exist.
  const migrationRunner = new DataSource({
    type: 'postgres',
    url: postgresUri,
    entities: [
      UserEntity,
      FarmEntity,
      CropEntity,
      ActivitiesEntity,
      HarvestEntity,
      OutboxEntity,
    ],
    migrations,
    synchronize: false,
  });
  await migrationRunner.initialize();
  await migrationRunner.runMigrations();

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
    // farm → crop → activity/harvest chain is FK-linked.
    await migrationRunner.query(
      'TRUNCATE TABLE activities, harvests, crops, farms, outbox, users RESTART IDENTITY CASCADE',
    );
  };

  const teardown = async () => {
    await gateway.close();
    await farms.close();
    await auth.close();
    await migrationRunner.destroy();
    await Promise.all([
      postgres.stop(),
      ...containers.map((container) => container.stop()),
    ]);
  };

  return { gateway, reset, teardown };
}
