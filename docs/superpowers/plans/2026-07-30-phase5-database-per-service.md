# Phase 5 — Database Per Service (auth/farms) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `auth` and `farms` their own PostgreSQL instance each, removing the shared-database coupling (eager `FarmEntity.user` join, `report.service.ts` querying `users` directly) and replacing the cross-service user data need with an event-carried local read model in `farms`.

**Architecture:** `auth` keeps `UserEntity` in its own DB; `farms` keeps `FarmEntity/CropEntity/ActivitiesEntity/HarvestEntity` in its own DB plus a new local `UserProjectionEntity` (id, firstName, lastName, email, rol) fed by `user.created`/`user.updated` events from `auth`'s own transactional outbox (mirroring the existing `farms → tracing` outbox). `FarmEntity.userId` becomes a plain scalar column — the IDOR ownership chain never needed the joined `User` row, only this id.

**Tech Stack:** NestJS 10, TypeORM 0.3 (Postgres), RabbitMQ (`@nestjs/microservices`), Jest.

## Global Constraints

- Every task must leave `pnpm build`, `pnpm lint:check`, and `pnpm test` green before it is considered done.
- No FK constraint may reference a table in a different service's database — `farms.userId` is a plain indexed integer, not a foreign key, once split.
- The `user_projection` upsert must be idempotent by `id` (redelivery of the same event must not duplicate or corrupt the row).
- Report output for the admin report changes shape (grouped by owner instead of one row per `User`) — this is an intentional, documented break, not a bug.
- Spec reference: `docs/superpowers/specs/2026-07-30-phase5-database-per-service-design.md`.

---

### Task 1: Move the transactional outbox to `libs/common` as a reusable base

**Files:**
- Create: `libs/common/src/outbox/outbox.service.ts`
- Create: `libs/common/src/outbox/base-outbox-relay.service.ts`
- Create: `libs/common/src/outbox/index.ts`
- Create: `libs/common/src/outbox/base-outbox-relay.service.spec.ts`
- Modify: `libs/common/src/index.ts`
- Modify: `apps/farms/src/outbox/outbox-relay.service.ts`
- Delete: `apps/farms/src/outbox/outbox.service.ts`
- Delete: `apps/farms/src/outbox/outbox-relay.service.spec.ts`
- Modify: `apps/farms/src/crops/crops.service.ts`, `apps/farms/src/activities/activities.service.ts`, `apps/farms/src/harvests/harvests.service.ts` (import path only)
- Modify: `apps/farms/src/farms.module.ts` (import path only)

**Interfaces:**
- Produces: `OutboxService.enqueue(manager: EntityManager, pattern: string, payload: Record<string, unknown>): Promise<void>` (same signature as before, now exported from `@app/common`).
- Produces: `abstract class BaseOutboxRelayService { protected abstract readonly logger: Logger; constructor(dataSource: DataSource, configService: ConfigService, targetClient: ClientProxy, enabledConfigKey: string); async drain(): Promise<void>; }` — exported from `@app/common`. Subclasses (farms' `OutboxRelayService`, auth's `AuthOutboxRelayService` in Task 7) provide their own `@Interval(...)`-decorated `drain()` that calls `super.drain()`.

- [x] **Step 1: Create the generic `OutboxService` in `libs/common`**

```typescript
// libs/common/src/outbox/outbox.service.ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OutboxEntity } from '../entities';

// Write side of the transactional outbox. `enqueue` MUST be called with the same
// EntityManager as the domain write, inside one transaction, so the event row
// and the domain row commit atomically.
@Injectable()
export class OutboxService {
  async enqueue(
    manager: EntityManager,
    pattern: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const row = manager.create(OutboxEntity, { pattern, payload });
    await manager.save(row);
  }
}
```

- [x] **Step 2: Create the generic `BaseOutboxRelayService`**

```typescript
// libs/common/src/outbox/base-outbox-relay.service.ts
import { Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { firstValueFrom } from 'rxjs';

const BATCH_SIZE = 20;

// Read side of the transactional outbox. Every service that owns an outbox
// table drains it on its own poll (see the concrete @Interval subclass) and
// dispatches pending rows to its own target client, out-of-band from the
// request that produced them. Publishing may be at-least-once (a crash between
// publish and mark re-sends on the next tick); consumers must be idempotent.
export abstract class BaseOutboxRelayService {
  protected abstract readonly logger: Logger;
  // Guards against overlapping runs if a drain takes longer than the interval.
  private draining = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly targetClient: ClientProxy,
    private readonly enabledConfigKey: string,
  ) {}

  async drain(): Promise<void> {
    // Operational switch: flip to "false" to simulate a publisher outage — rows
    // pile up durably instead of being lost, and drain once it is back on.
    if (this.configService.get(this.enabledConfigKey) === 'false') return;
    if (this.draining) return;
    this.draining = true;
    try {
      await this.drainOnce();
    } catch (err) {
      this.logger.error(`outbox drain failed: ${err?.message ?? err}`);
    } finally {
      this.draining = false;
    }
  }

  private async drainOnce(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // FOR UPDATE SKIP LOCKED lets multiple replicas drain concurrently
      // without ever grabbing the same row.
      const rows: Array<{
        id: number;
        pattern: string;
        payload: Record<string, unknown>;
      }> = await manager.query(
        `SELECT id, pattern, payload FROM outbox
         WHERE "publishedAt" IS NULL
         ORDER BY id
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [BATCH_SIZE],
      );

      for (const row of rows) {
        try {
          await firstValueFrom(
            this.targetClient.emit(row.pattern, row.payload),
          );
          await manager.query(
            `UPDATE outbox SET "publishedAt" = now() WHERE id = $1`,
            [row.id],
          );
        } catch (err) {
          // Leave it pending; retry next tick. Bump attempts for visibility.
          await manager.query(
            `UPDATE outbox SET attempts = attempts + 1 WHERE id = $1`,
            [row.id],
          );
          this.logger.warn(
            `outbox row ${row.id} (${row.pattern}) publish failed: ${
              err?.message ?? err
            }`,
          );
        }
      }

      if (rows.length) {
        this.logger.log(`outbox drained ${rows.length} event(s)`);
      }
    });
  }
}
```

- [x] **Step 3: Barrel export and wire into `@app/common`**

```typescript
// libs/common/src/outbox/index.ts
export * from './outbox.service';
export * from './base-outbox-relay.service';
```

Add to `libs/common/src/index.ts` (alongside the other `export * from` lines):

```typescript
export * from './outbox';
```

- [x] **Step 4: Move the relay test to `libs/common`, testing the base class through a throwaway subclass**

```typescript
// libs/common/src/outbox/base-outbox-relay.service.spec.ts
import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { BaseOutboxRelayService } from './base-outbox-relay.service';

// Pure unit test: the DataSource and the target client are mocked, so nothing
// touches Postgres or the broker.
class TestOutboxRelayService extends BaseOutboxRelayService {
  protected readonly logger = new Logger('TestOutboxRelayService');
}

describe('BaseOutboxRelayService', () => {
  let service: BaseOutboxRelayService;
  let manager: { query: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let targetClient: { emit: jest.Mock };
  let config: { get: jest.Mock };

  const buildManager = (pendingRows: any[]) => ({
    // First call is the SELECT ... FOR UPDATE SKIP LOCKED; the rest are UPDATEs.
    query: jest.fn((sql: string) =>
      sql.includes('SELECT') ? Promise.resolve(pendingRows) : Promise.resolve(),
    ),
  });

  beforeEach(() => {
    config = { get: jest.fn().mockReturnValue('true') };
    targetClient = { emit: jest.fn().mockReturnValue(of(undefined)) };
    manager = buildManager([]);
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    service = new TestOutboxRelayService(
      dataSource as any,
      config as any,
      targetClient as any,
      'OUTBOX_RELAY_ENABLED',
    );
  });

  it('does nothing when the relay is disabled', async () => {
    config.get.mockReturnValue('false');
    await service.drain();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(config.get).toHaveBeenCalledWith('OUTBOX_RELAY_ENABLED');
  });

  it('publishes each pending row and marks it published', async () => {
    manager = buildManager([
      { id: 1, pattern: 'crop.initialized', payload: { cropId: 7 } },
      { id: 2, pattern: 'harvest.created', payload: { cropId: 7 } },
    ]);
    dataSource.transaction = jest.fn((cb) => cb(manager));

    await service.drain();

    expect(targetClient.emit).toHaveBeenCalledWith('crop.initialized', {
      cropId: 7,
    });
    expect(targetClient.emit).toHaveBeenCalledWith('harvest.created', {
      cropId: 7,
    });
    const updates = manager.query.mock.calls.filter(([sql]) =>
      sql.includes('SET "publishedAt"'),
    );
    expect(updates.map(([, params]) => params[0])).toEqual([1, 2]);
  });

  it('bumps attempts and leaves the row pending when the publish fails', async () => {
    manager = buildManager([
      { id: 9, pattern: 'crop.initialized', payload: {} },
    ]);
    dataSource.transaction = jest.fn((cb) => cb(manager));
    targetClient.emit.mockReturnValue(
      throwError(() => new Error('broker down')),
    );

    await service.drain();

    const marks = manager.query.mock.calls.filter(([sql]) =>
      sql.includes('SET "publishedAt"'),
    );
    const bumps = manager.query.mock.calls.filter(([sql]) =>
      sql.includes('attempts = attempts + 1'),
    );
    expect(marks).toHaveLength(0);
    expect(bumps).toHaveLength(1);
    expect(bumps[0][1][0]).toBe(9);
  });

  it('does not run a second drain while one is in flight', async () => {
    let release: () => void;
    const gate = new Promise<void>((r) => (release = r));
    dataSource.transaction = jest.fn(async (cb) => {
      await gate; // hold the first drain open
      return cb(buildManager([]));
    });

    const first = service.drain();
    await service.drain(); // should early-return on the in-flight guard
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);

    release();
    await first;
  });
});
```

Delete `apps/farms/src/outbox/outbox-relay.service.spec.ts` (superseded by the spec above) and `apps/farms/src/outbox/outbox.service.ts` (superseded by `libs/common/src/outbox/outbox.service.ts`).

- [x] **Step 5: Shrink farms' `OutboxRelayService` to a thin subclass**

```typescript
// apps/farms/src/outbox/outbox-relay.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BaseOutboxRelayService } from '@app/common';

@Injectable()
export class OutboxRelayService extends BaseOutboxRelayService {
  protected readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    dataSource: DataSource,
    configService: ConfigService,
    @Inject('TRACING_SERVICE') tracingClient: ClientProxy,
  ) {
    super(dataSource, configService, tracingClient, 'OUTBOX_RELAY_ENABLED');
  }

  @Interval('farms-outbox-relay', 3000)
  async drain(): Promise<void> {
    return super.drain();
  }
}
```

- [x] **Step 6: Fix import paths for the moved `OutboxService`**

In `apps/farms/src/crops/crops.service.ts`, `apps/farms/src/activities/activities.service.ts`, and `apps/farms/src/harvests/harvests.service.ts`, change:

```typescript
import { OutboxService } from '../outbox/outbox.service';
```

to:

```typescript
import { OutboxService } from '@app/common';
```

In `apps/farms/src/farms.module.ts`, change the import:

```typescript
import { OutboxService } from './outbox/outbox.service';
```

to:

```typescript
import { OutboxService } from '@app/common';
```

(`OutboxRelayService` stays imported from `./outbox/outbox-relay.service'` — unchanged.)

- [x] **Step 7: Run the full test suite and build**

Run: `pnpm build && pnpm lint:check && pnpm test`
Expected: PASS, no references to the deleted `apps/farms/src/outbox/outbox.service.ts` remain.

- [x] **Step 8: Commit**

```bash
git add libs/common/src/outbox apps/farms/src/outbox apps/farms/src/crops/crops.service.ts apps/farms/src/activities/activities.service.ts apps/farms/src/harvests/harvests.service.ts apps/farms/src/farms.module.ts libs/common/src/index.ts
git commit -m "refactor: move transactional outbox to libs/common as a reusable base"
```

---

### Task 2: Add `UserProjectionEntity`

**Files:**
- Create: `libs/common/src/entities/user-projection.entity.ts`
- Modify: `libs/common/src/entities/index.ts`

**Interfaces:**
- Produces: `UserProjectionEntity { id: number; firstName: string; lastName: string | null; email: string; rol: string | null; updatedAt: Date }`, table `user_projection`, exported from `@app/common`.

- [x] **Step 1: Create the entity**

```typescript
// libs/common/src/entities/user-projection.entity.ts
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Local, read-only projection of the subset of `auth`'s UserEntity that
// `farms` needs (report ownership metadata, admin-role check). Kept in sync by
// consuming `user.created`/`user.updated` events emitted from auth's own
// transactional outbox — never written to directly by farms' own code paths.
// `id` is NOT a generated column: it is the id assigned by auth, applied via
// upsert.
@Entity('user_projection')
export class UserProjectionEntity {
  @PrimaryColumn()
  id: number;

  @Column()
  firstName: string;

  @Column({ nullable: true })
  lastName: string | null;

  @Column()
  email: string;

  @Column({ nullable: true })
  rol: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

- [x] **Step 2: Export it**

In `libs/common/src/entities/index.ts`, add:

```typescript
export * from './user-projection.entity';
```

- [x] **Step 3: Build**

Run: `pnpm build`
Expected: PASS (entity not yet referenced by any module — no runtime effect).

- [x] **Step 4: Commit**

```bash
git add libs/common/src/entities/user-projection.entity.ts libs/common/src/entities/index.ts
git commit -m "feat: add UserProjectionEntity for farms' local read model of user data"
```

---

### Task 3: Split migrations, data sources, and `PostgresDBModule` per service

**Files:**
- Create: `apps/auth/src/db/migrations/1785100000000-AuthInitialSchema.ts`
- Create: `apps/auth/src/db/migrations/1785100000001-AuthOutbox.ts`
- Create: `apps/auth/src/db/migrations/index.ts`
- Create: `apps/farms/src/db/migrations/1785100000000-FarmsInitialSchema.ts`
- Create: `apps/farms/src/db/migrations/1785100000001-FarmsOutbox.ts`
- Create: `apps/farms/src/db/migrations/1785100000002-FarmsUserProjection.ts`
- Create: `apps/farms/src/db/migrations/index.ts`
- Create: `apps/farms/src/db/data-source.ts`
- Modify: `apps/auth/src/db/data-source.ts`
- Modify: `libs/common/src/modules/db.module.ts`
- Modify: `apps/auth/src/auth.module.ts` (PostgresDBModule usage only — entity list changes come in Task 6)
- Modify: `apps/farms/src/farms.module.ts` (PostgresDBModule usage only)
- Modify: `libs/common/src/config/env.validation.ts`
- Modify: `.env.example`
- Modify: `package.json`
- Delete: `libs/common/src/migrations/` (whole directory: `index.ts`, `1785028946448-InitialSchema.ts`, `1785033448000-Outbox.ts`)
- Modify: `libs/common/src/index.ts` (remove the migrations export)

**Interfaces:**
- Produces: `PostgresDBModule.forApp({ migrations: Function[], uriEnvKey: string }): DynamicModule`, replacing the old static `PostgresDBModule` import.
- Produces: `AUTH_POSTGRES_URI`, `FARMS_POSTGRES_URI` env vars (replacing `POSTGRES_URI`).

- [x] **Step 1: Auth's own initial-schema migration (users only, no FK)**

```typescript
// apps/auth/src/db/migrations/1785100000000-AuthInitialSchema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthInitialSchema1785100000000 implements MigrationInterface {
  name = 'AuthInitialSchema1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_gender_enum" AS ENUM('1', '2', '3')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_documenttype_enum" AS ENUM('1', '2')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" SERIAL NOT NULL, "firstName" character varying NOT NULL, "lastName" character varying, "email" character varying NOT NULL, "password" character varying NOT NULL, "rol" character varying, "photo" character varying, "gender" "public"."users_gender_enum", "documentType" "public"."users_documenttype_enum", "documentNumber" integer, "dateOfBirth" date, "country" character varying, "forgotPasswordToken" character varying, "state" character varying, "city" character varying, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_documenttype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_gender_enum"`);
  }
}
```

- [x] **Step 2: Auth's own outbox migration**

```typescript
// apps/auth/src/db/migrations/1785100000001-AuthOutbox.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Transactional outbox table for auth's own database (see OutboxEntity in
// @app/common). Written alongside the `users` row in one transaction; drained
// to RabbitMQ by AuthOutboxRelayService.
export class AuthOutbox1785100000001 implements MigrationInterface {
  name = 'AuthOutbox1785100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "outbox" ("id" SERIAL NOT NULL, "pattern" character varying NOT NULL, "payload" jsonb NOT NULL, "publishedAt" TIMESTAMP WITH TIME ZONE, "attempts" integer NOT NULL DEFAULT 0, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_auth_outbox_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_outbox_pending" ON "outbox" ("publishedAt") WHERE "publishedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_auth_outbox_pending"`);
    await queryRunner.query(`DROP TABLE "outbox"`);
  }
}
```

- [x] **Step 3: Auth's migrations barrel**

```typescript
// apps/auth/src/db/migrations/index.ts
import { AuthInitialSchema1785100000000 } from './1785100000000-AuthInitialSchema';
import { AuthOutbox1785100000001 } from './1785100000001-AuthOutbox';

export const migrations = [
  AuthInitialSchema1785100000000,
  AuthOutbox1785100000001,
];
```

- [x] **Step 4: Farms' own initial-schema migration (farms/crops/harvests/activities, no FK to users)**

```typescript
// apps/farms/src/db/migrations/1785100000000-FarmsInitialSchema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class FarmsInitialSchema1785100000000 implements MigrationInterface {
  name = 'FarmsInitialSchema1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "farms" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "location" character varying NOT NULL, "photo" character varying, "state" integer NOT NULL, "area" integer NOT NULL, "userId" integer, CONSTRAINT "UQ_8dfb4ca1531d2f3c41f102783e2" UNIQUE ("name", "userId"), CONSTRAINT "PK_39aff9c35006b14025bba5a43d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "harvests" ("id" SERIAL NOT NULL, "photo" character varying, "harvestDate" character varying NOT NULL, "amount" integer NOT NULL, "unit" character varying NOT NULL, "category" character varying NOT NULL, "description" character varying, "cropId" integer, CONSTRAINT "PK_fb748ae28bc0000875b1949a0a6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "crops" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "product" character varying NOT NULL, "size" integer NOT NULL, "location" character varying NOT NULL, "photo" character varying, "sowingDate" character varying NOT NULL, "plants" integer NOT NULL, "farmId" integer, CONSTRAINT "PK_098dbeb7c803dc7c08a7f02b805" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "activities" ("id" SERIAL NOT NULL, "photo" character varying, "type" character varying, "inputDate" character varying, "title" character varying, "manufactureLocation" character varying, "appRatio" character varying, "appMethod" character varying, "comment" character varying, "category" character varying, "bioName" character varying, "bioType" character varying, "cropId" integer, CONSTRAINT "PK_7f4004429f731ffb9c88eb486a8" PRIMARY KEY ("id"))`,
    );
    // Intra-farms-DB FKs only. NOTE: no FK from farms.userId to users.id —
    // that table lives in a different database now.
    await queryRunner.query(
      `ALTER TABLE "harvests" ADD CONSTRAINT "FK_e849e688de0a0119e0cff46234d" FOREIGN KEY ("cropId") REFERENCES "crops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "crops" ADD CONSTRAINT "FK_22c38f5ca32439c43bf2a9142a2" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "activities" ADD CONSTRAINT "FK_581a63e66f7ddbb12acc2267bb3" FOREIGN KEY ("cropId") REFERENCES "crops"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activities" DROP CONSTRAINT "FK_581a63e66f7ddbb12acc2267bb3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crops" DROP CONSTRAINT "FK_22c38f5ca32439c43bf2a9142a2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "harvests" DROP CONSTRAINT "FK_e849e688de0a0119e0cff46234d"`,
    );
    await queryRunner.query(`DROP TABLE "activities"`);
    await queryRunner.query(`DROP TABLE "crops"`);
    await queryRunner.query(`DROP TABLE "harvests"`);
    await queryRunner.query(`DROP TABLE "farms"`);
  }
}
```

- [x] **Step 5: Farms' own outbox migration**

```typescript
// apps/farms/src/db/migrations/1785100000001-FarmsOutbox.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class FarmsOutbox1785100000001 implements MigrationInterface {
  name = 'FarmsOutbox1785100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "outbox" ("id" SERIAL NOT NULL, "pattern" character varying NOT NULL, "payload" jsonb NOT NULL, "publishedAt" TIMESTAMP WITH TIME ZONE, "attempts" integer NOT NULL DEFAULT 0, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_farms_outbox_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_farms_outbox_pending" ON "outbox" ("publishedAt") WHERE "publishedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_farms_outbox_pending"`);
    await queryRunner.query(`DROP TABLE "outbox"`);
  }
}
```

- [x] **Step 6: Farms' `user_projection` migration**

```typescript
// apps/farms/src/db/migrations/1785100000002-FarmsUserProjection.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Local read model of auth's users, kept in sync by consuming
// user.created/user.updated events (see UserProjectionService).
export class FarmsUserProjection1785100000002 implements MigrationInterface {
  name = 'FarmsUserProjection1785100000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_projection" ("id" integer NOT NULL, "firstName" character varying NOT NULL, "lastName" character varying, "email" character varying NOT NULL, "rol" character varying, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_user_projection_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_projection"`);
  }
}
```

- [x] **Step 7: Farms' migrations barrel**

```typescript
// apps/farms/src/db/migrations/index.ts
import { FarmsInitialSchema1785100000000 } from './1785100000000-FarmsInitialSchema';
import { FarmsOutbox1785100000001 } from './1785100000001-FarmsOutbox';
import { FarmsUserProjection1785100000002 } from './1785100000002-FarmsUserProjection';

export const migrations = [
  FarmsInitialSchema1785100000000,
  FarmsOutbox1785100000001,
  FarmsUserProjection1785100000002,
];
```

- [x] **Step 8: Delete the shared migrations directory and its export**

```bash
git rm -r libs/common/src/migrations
```

In `libs/common/src/index.ts`, remove the line:

```typescript
export * from './migrations';
```

- [x] **Step 9: Trim auth's CLI data source to its own entities/migrations**

```typescript
// apps/auth/src/db/data-source.ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { OutboxEntity, UserEntity } from '@app/common';
import { migrations } from './migrations';

/**
 * DataSource for the TypeORM CLI (migration:generate / migration:run), run via
 * ts-node so `@app/common` resolves through tsconfig-paths. AUTH_POSTGRES_URI
 * comes from the environment. Migrations live alongside this file so they are
 * bundled into auth's build and can also run at startup (see PostgresDBModule).
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.AUTH_POSTGRES_URI,
  entities: [UserEntity, OutboxEntity],
  migrations,
  synchronize: false,
});
```

- [x] **Step 10: Create farms' CLI data source**

```typescript
// apps/farms/src/db/data-source.ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  ActivitiesEntity,
  CropEntity,
  FarmEntity,
  HarvestEntity,
  OutboxEntity,
  UserProjectionEntity,
} from '@app/common';
import { migrations } from './migrations';

/**
 * DataSource for the TypeORM CLI (migration:generate / migration:run), run via
 * ts-node so `@app/common` resolves through tsconfig-paths. FARMS_POSTGRES_URI
 * comes from the environment. Migrations live alongside this file so they are
 * bundled into farms' build and can also run at startup (see PostgresDBModule).
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.FARMS_POSTGRES_URI,
  entities: [
    FarmEntity,
    CropEntity,
    ActivitiesEntity,
    HarvestEntity,
    OutboxEntity,
    UserProjectionEntity,
  ],
  migrations,
  synchronize: false,
});
```

- [x] **Step 11: Make `PostgresDBModule` a per-app dynamic module**

```typescript
// libs/common/src/modules/db.module.ts
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

export interface PostgresDBModuleOptions {
  // The migration classes this app's database owns (its own migrations/index.ts).
  migrations: Function[];
  // The env var holding this app's own Postgres connection string, e.g.
  // 'AUTH_POSTGRES_URI' or 'FARMS_POSTGRES_URI'.
  uriEnvKey: string;
}

@Module({})
export class PostgresDBModule {
  static forApp(options: PostgresDBModuleOptions): DynamicModule {
    return {
      module: PostgresDBModule,
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory: (configService: ConfigService) => ({
            type: 'postgres',
            url: configService.get(options.uriEnvKey),
            autoLoadEntities: true,
            // Schema is owned by migrations now, never by synchronize (which can
            // silently drop/alter columns and lose data).
            synchronize: false,
            migrations: options.migrations,
            // Each service now owns its own database, so each can safely run
            // its own migrations on startup — no more shared-instance race.
            migrationsRun: configService.get('DB_RUN_MIGRATIONS') === 'true',
          }),
          inject: [ConfigService],
        }),
      ],
    };
  }
}
```

- [x] **Step 12: Wire auth's module to the new `forApp`**

In `apps/auth/src/auth.module.ts`, replace:

```typescript
import {
  ActivitiesEntity,
  AwsS3Module,
  CropEntity,
  FarmEntity,
  HarvestEntity,
  AppLoggerModule,
  HealthModule,
  NotificationsService,
  PostgresDBModule,
  RabbitmqModule,
  RabbitmqService,
  RedisModule,
  UserEntity,
} from '@app/common';
```

with (drop the farms entities here — Task 6 removes their registration in `forFeature` too):

```typescript
import {
  AwsS3Module,
  AppLoggerModule,
  HealthModule,
  NotificationsService,
  PostgresDBModule,
  RabbitmqModule,
  RabbitmqService,
  RedisModule,
  UserEntity,
} from '@app/common';
import { migrations as authMigrations } from './db/migrations';
```

and replace the `PostgresDBModule` entry in the `imports` array:

```typescript
    PostgresDBModule,
```

with:

```typescript
    PostgresDBModule.forApp({
      migrations: authMigrations,
      uriEnvKey: 'AUTH_POSTGRES_URI',
    }),
```

(Leave `TypeOrmModule.forFeature([...])` as-is for now — Task 6 trims it.)

- [x] **Step 13: Wire farms' module to the new `forApp`**

In `apps/farms/src/farms.module.ts`, add the import:

```typescript
import { migrations as farmsMigrations } from './db/migrations';
```

and replace the `PostgresDBModule` entry in `imports`:

```typescript
    PostgresDBModule,
```

with:

```typescript
    PostgresDBModule.forApp({
      migrations: farmsMigrations,
      uriEnvKey: 'FARMS_POSTGRES_URI',
    }),
```

- [x] **Step 14: Update env validation**

In `libs/common/src/config/env.validation.ts`, replace:

```typescript
  POSTGRES_URI: Joi.string().required(),
```

with:

```typescript
  AUTH_POSTGRES_URI: Joi.string().required(),
  FARMS_POSTGRES_URI: Joi.string().required(),
```

- [x] **Step 15: Update `.env.example`**

Replace the `# --- Database ---` block:

```
# --- Database ---
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=harvestledger
POSTGRES_URI=postgresql://user:password@postgres:5432/harvestledger

# Run pending TypeORM migrations on startup. Enabled for a single service
# (auth) so the services don't race to migrate; keep this false elsewhere.
DB_RUN_MIGRATIONS=false
```

with:

```
# --- Database (one Postgres instance per service) ---
POSTGRES_USER=user
POSTGRES_PASSWORD=password
AUTH_POSTGRES_DB=harvestledger_auth
FARMS_POSTGRES_DB=harvestledger_farms
AUTH_POSTGRES_URI=postgresql://user:password@postgres-auth:5432/harvestledger_auth
FARMS_POSTGRES_URI=postgresql://user:password@postgres-farms:5432/harvestledger_farms

# Run pending TypeORM migrations on startup. Each service now owns its own
# database, so both auth and farms run their own (see docker-compose.yml).
DB_RUN_MIGRATIONS=false
```

- [x] **Step 16: Replace the TypeORM CLI scripts in `package.json`**

Replace:

```json
    "typeorm": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js -d apps/auth/src/db/data-source.ts",
    "migration:generate": "pnpm typeorm migration:generate",
    "migration:run": "pnpm typeorm migration:run",
    "migration:revert": "pnpm typeorm migration:revert",
```

with:

```json
    "typeorm:auth": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js -d apps/auth/src/db/data-source.ts",
    "typeorm:farms": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js -d apps/farms/src/db/data-source.ts",
    "migration:generate:auth": "pnpm typeorm:auth migration:generate",
    "migration:run:auth": "pnpm typeorm:auth migration:run",
    "migration:revert:auth": "pnpm typeorm:auth migration:revert",
    "migration:generate:farms": "pnpm typeorm:farms migration:generate",
    "migration:run:farms": "pnpm typeorm:farms migration:run",
    "migration:revert:farms": "pnpm typeorm:farms migration:revert",
```

- [x] **Step 17: Build**

Run: `pnpm build`
Expected: FAIL at this point is acceptable only if the error is exclusively about `UserEntity`/`FarmEntity` cross-registration in `auth.module.ts`/`farms.module.ts` `forFeature` arrays (fixed in Task 6) — everything else must compile. If any other error appears, fix it before moving on.

- [x] **Step 18: Commit**

```bash
git add apps/auth/src/db apps/farms/src/db libs/common/src/modules/db.module.ts libs/common/src/config/env.validation.ts libs/common/src/index.ts .env.example package.json apps/auth/src/auth.module.ts apps/farms/src/farms.module.ts
git commit -m "feat: split TypeORM migrations, data sources, and Postgres connection per service"
```

---

### Task 4: `FarmEntity.userId` scalar column; drop the eager cross-service relation

**Files:**
- Modify: `libs/common/src/entities/farms.entity.ts`
- Modify: `libs/common/src/entities/user.entity.ts`

**Interfaces:**
- Produces: `FarmEntity.userId: number` (plain column, replacing `FarmEntity.user: UserEntity`).

- [x] **Step 1: Update `FarmEntity`**

```typescript
// libs/common/src/entities/farms.entity.ts
import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CropEntity } from './crops.entity';

export enum FarmState {
  ownnotmorgaged = 1,
  ownmorgaged = 2,
  leased = 3,
}

@Entity('farms')
// A farm name is unique per owner, not globally — two users may each have a
// farm called "North field".
@Unique(['name', 'userId'])
export class FarmEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  location: string;

  @Column({ nullable: true })
  photo: string;

  @Column()
  state: FarmState;

  @Column()
  area: number;

  // Plain FK-shaped column, not a TypeORM relation: `users` lives in a
  // different database (auth's) once split, so there is no engine-level FK
  // and no join. Ownership checks compare this value directly
  // (see OwnershipService); farms' local UserProjectionEntity carries the
  // denormalized profile data for reports.
  @Column()
  userId: number;

  @OneToMany(() => CropEntity, (crop) => crop.farm)
  crops: CropEntity[];
}
```

- [x] **Step 2: Drop `UserEntity`'s inverse relation**

```typescript
// libs/common/src/entities/user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
export enum Gender {
  male = 1,
  female = 2,
  other = 3,
}

export enum DocumentType {
  CC = 1,
  NIT = 2,
}

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column({ nullable: true })
  rol: string;

  @Column({ nullable: true })
  photo: string;

  @Column({ nullable: true, type: 'enum', enum: Gender })
  gender: number;

  @Column({ nullable: true, type: 'enum', enum: DocumentType })
  documentType: number;

  @Column({ nullable: true })
  documentNumber: number;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  forgotPasswordToken: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  city: string;
}
```

(This step will not compile cleanly until Task 5 fixes the code that still reads `farm.user`/`.user.id` — that is expected and resolved in the next task. Do not run the build gate until Task 5, step 6.)

- [x] **Step 3: Commit**

```bash
git add libs/common/src/entities/farms.entity.ts libs/common/src/entities/user.entity.ts
git commit -m "refactor: FarmEntity.user (eager relation) -> FarmEntity.userId (scalar column)"
```

---

### Task 5: Update `farms` services to use `userId` instead of the `user` relation

**Files:**
- Modify: `apps/farms/src/ownership/ownership.service.ts`
- Create: `apps/farms/src/ownership/ownership.service.spec.ts` (currently empty)
- Modify: `apps/farms/src/farms/farms.service.ts`
- Modify: `apps/farms/src/crops/crops.service.ts`
- Modify: `apps/farms/src/activities/activities.service.ts`
- Modify: `apps/farms/src/harvests/harvests.service.ts`

**Interfaces:**
- Consumes: `FarmEntity.userId: number` (Task 4).
- Produces: `OwnershipService.assertFarmOwner/assertCropOwner/assertActivityOwner/assertHarvestOwner` — same signatures as before, now checking `farm.userId` instead of `farm.user?.id`.

- [x] **Step 1: Rewrite `OwnershipService`**

```typescript
// apps/farms/src/ownership/ownership.service.ts
import {
  ActivitiesEntity,
  CropEntity,
  FarmEntity,
  HarvestEntity,
} from '@app/common';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/**
 * Resolves and enforces the ownership chain
 *   User ──< Farm ──< Crop ──< Activity / Harvest
 * so a user can only touch resources that ultimately belong to them.
 *
 * `FarmEntity.userId` is a plain scalar column (not a relation — `users`
 * lives in a different database), so no join to user data is ever needed
 * here. Each method throws:
 *  - NotFoundException  when the resource does not exist, and
 *  - ForbiddenException when it exists but belongs to a different user
 * (deliberately distinct: a missing resource is a 404, someone else's is a 403).
 */
@Injectable()
export class OwnershipService {
  constructor(
    @InjectRepository(FarmEntity)
    private readonly farmsRepository: Repository<FarmEntity>,
    @InjectRepository(CropEntity)
    private readonly cropsRepository: Repository<CropEntity>,
    @InjectRepository(ActivitiesEntity)
    private readonly activitiesRepository: Repository<ActivitiesEntity>,
    @InjectRepository(HarvestEntity)
    private readonly harvestsRepository: Repository<HarvestEntity>,
  ) {}

  async assertFarmOwner(userId: number, farmId: number): Promise<FarmEntity> {
    const farm = await this.farmsRepository.findOne({ where: { id: farmId } });
    if (!farm) {
      throw new NotFoundException('Farm not found');
    }
    this.check(userId, farm.userId);
    return farm;
  }

  async assertCropOwner(userId: number, cropId: number): Promise<CropEntity> {
    const crop = await this.cropsRepository.findOne({
      where: { id: cropId },
      relations: ['farm'],
    });
    if (!crop) {
      throw new NotFoundException('Crop not found');
    }
    this.check(userId, crop.farm?.userId);
    return crop;
  }

  async assertActivityOwner(
    userId: number,
    activityId: number,
  ): Promise<ActivitiesEntity> {
    const activity = await this.activitiesRepository.findOne({
      where: { id: activityId },
      relations: ['crop', 'crop.farm'],
    });
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    this.check(userId, activity.crop?.farm?.userId);
    return activity;
  }

  async assertHarvestOwner(
    userId: number,
    harvestId: number,
  ): Promise<HarvestEntity> {
    const harvest = await this.harvestsRepository.findOne({
      where: { id: harvestId },
      relations: ['crop', 'crop.farm'],
    });
    if (!harvest) {
      throw new NotFoundException('Harvest not found');
    }
    this.check(userId, harvest.crop?.farm?.userId);
    return harvest;
  }

  private check(userId: number, ownerId: number | undefined): void {
    if (ownerId === undefined || ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this resource');
    }
  }
}
```

- [x] **Step 2: Write the ownership unit tests (the existing spec file is empty)**

```typescript
// apps/farms/src/ownership/ownership.service.spec.ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OwnershipService } from './ownership.service';

describe('OwnershipService', () => {
  let farmsRepository: { findOne: jest.Mock };
  let cropsRepository: { findOne: jest.Mock };
  let activitiesRepository: { findOne: jest.Mock };
  let harvestsRepository: { findOne: jest.Mock };
  let service: OwnershipService;

  beforeEach(() => {
    farmsRepository = { findOne: jest.fn() };
    cropsRepository = { findOne: jest.fn() };
    activitiesRepository = { findOne: jest.fn() };
    harvestsRepository = { findOne: jest.fn() };
    service = new OwnershipService(
      farmsRepository as any,
      cropsRepository as any,
      activitiesRepository as any,
      harvestsRepository as any,
    );
  });

  describe('assertFarmOwner', () => {
    it('throws NotFoundException when the farm does not exist', async () => {
      farmsRepository.findOne.mockResolvedValue(null);
      await expect(service.assertFarmOwner(1, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the farm belongs to another user', async () => {
      farmsRepository.findOne.mockResolvedValue({ id: 1, userId: 2 });
      await expect(service.assertFarmOwner(1, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns the farm when the requester is the owner', async () => {
      const farm = { id: 1, userId: 1 };
      farmsRepository.findOne.mockResolvedValue(farm);
      await expect(service.assertFarmOwner(1, 1)).resolves.toBe(farm);
    });
  });

  describe('assertCropOwner', () => {
    it('throws NotFoundException when the crop does not exist', async () => {
      cropsRepository.findOne.mockResolvedValue(null);
      await expect(service.assertCropOwner(1, 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException via the farm.userId chain', async () => {
      cropsRepository.findOne.mockResolvedValue({
        id: 1,
        farm: { id: 1, userId: 2 },
      });
      await expect(service.assertCropOwner(1, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns the crop when the requester owns the parent farm', async () => {
      const crop = { id: 1, farm: { id: 1, userId: 1 } };
      cropsRepository.findOne.mockResolvedValue(crop);
      await expect(service.assertCropOwner(1, 1)).resolves.toBe(crop);
    });
  });

  describe('assertActivityOwner', () => {
    it('throws ForbiddenException via the crop.farm.userId chain', async () => {
      activitiesRepository.findOne.mockResolvedValue({
        id: 1,
        crop: { farm: { userId: 2 } },
      });
      await expect(
        service.assertActivityOwner(1, 1),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns the activity when the requester owns the chain', async () => {
      const activity = { id: 1, crop: { farm: { userId: 1 } } };
      activitiesRepository.findOne.mockResolvedValue(activity);
      await expect(service.assertActivityOwner(1, 1)).resolves.toBe(activity);
    });
  });

  describe('assertHarvestOwner', () => {
    it('throws ForbiddenException via the crop.farm.userId chain', async () => {
      harvestsRepository.findOne.mockResolvedValue({
        id: 1,
        crop: { farm: { userId: 2 } },
      });
      await expect(
        service.assertHarvestOwner(1, 1),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns the harvest when the requester owns the chain', async () => {
      const harvest = { id: 1, crop: { farm: { userId: 1 } } };
      harvestsRepository.findOne.mockResolvedValue(harvest);
      await expect(service.assertHarvestOwner(1, 1)).resolves.toBe(harvest);
    });
  });
});
```

- [x] **Step 3: Run the ownership tests**

Run: `npx jest apps/farms/src/ownership -t OwnershipService`
Expected: PASS.

- [x] **Step 4: Fix `farms.service.ts`**

In `apps/farms/src/farms/farms.service.ts`, in `createFarm`, replace:

```typescript
    const farm = await this.farmsRepository.find({
      where: { name: Equal(createFarmDto.name), user: Equal(userId) },
    });
```

with:

```typescript
    const farm = await this.farmsRepository.find({
      where: { name: Equal(createFarmDto.name), userId: Equal(userId) },
    });
```

and:

```typescript
    const newFarm = this.farmsRepository.create({
      ...createFarmDto,
      user: { id: userId },
    });
```

with:

```typescript
    const newFarm = this.farmsRepository.create({
      ...createFarmDto,
      userId,
    });
```

In `findAllByUserId`, replace:

```typescript
    const farms = await this.farmsRepository.find({
      where: { user: Equal(userId) },
    });
```

with:

```typescript
    const farms = await this.farmsRepository.find({
      where: { userId: Equal(userId) },
    });
```

- [x] **Step 5: Fix `crops.service.ts`, `activities.service.ts`, `harvests.service.ts`**

In `apps/farms/src/crops/crops.service.ts`, `createCrop`, replace:

```typescript
      await this.outbox.enqueue(manager, 'crop.initialized', {
        cropId: saved.id,
        farmId: farm.id,
        userId: farm.user?.id,
        payload: saved,
      });
```

with:

```typescript
      await this.outbox.enqueue(manager, 'crop.initialized', {
        cropId: saved.id,
        farmId: farm.id,
        userId: farm.userId,
        payload: saved,
      });
```

In `apps/farms/src/activities/activities.service.ts`, `createActivity`, replace:

```typescript
      await this.outbox.enqueue(manager, 'activity.created', {
        cropId,
        farmId: crop.farm?.id,
        userId: crop.farm?.user?.id,
        payload: saved,
      });
```

with:

```typescript
      await this.outbox.enqueue(manager, 'activity.created', {
        cropId,
        farmId: crop.farm?.id,
        userId: crop.farm?.userId,
        payload: saved,
      });
```

In `apps/farms/src/harvests/harvests.service.ts`, `createHarvest`, replace:

```typescript
      await this.outbox.enqueue(manager, 'harvest.created', {
        cropId,
        farmId: crop.farm?.id,
        userId: crop.farm?.user?.id,
        payload: saved,
      });
```

with:

```typescript
      await this.outbox.enqueue(manager, 'harvest.created', {
        cropId,
        farmId: crop.farm?.id,
        userId: crop.farm?.userId,
        payload: saved,
      });
```

- [x] **Step 6: Build and run the full farms test suite**

Run: `pnpm build && pnpm --filter farms exec jest apps/farms 2>/dev/null || npx jest apps/farms`
Expected: PASS. (`apps/farms/src/crops/crops.service.spec.ts`, `activities.service.spec.ts`, `harvests.service.spec.ts` already mock `farm`/`crop.farm` as plain objects with a `user` field for the outbox payload assertion — update any such mock's `user: { id: N }` to `userId: N` if the assertion checks the emitted `userId` value. Grep first: `grep -rn "user: { id" apps/farms/src/**/*.spec.ts` and `grep -rn "farm.user" apps/farms/src`.)

- [x] **Step 7: Commit**

```bash
git add apps/farms/src/ownership apps/farms/src/farms/farms.service.ts apps/farms/src/crops/crops.service.ts apps/farms/src/activities/activities.service.ts apps/farms/src/harvests/harvests.service.ts
git commit -m "refactor: farms services use FarmEntity.userId scalar instead of the user relation"
```

---

### Task 6: Remove the vestigial farms-entity registrations from `auth`, and `UserEntity` from `farms`

**Files:**
- Modify: `apps/auth/src/auth.module.ts`
- Modify: `apps/farms/src/farms.module.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is strictly a cleanup so `TypeOrmModule.forFeature` on each side only lists entities that live in that service's own database.

- [x] **Step 1: Trim `auth.module.ts`'s `forFeature`**

Replace:

```typescript
    TypeOrmModule.forFeature([
      UserEntity,
      FarmEntity,
      CropEntity,
      ActivitiesEntity,
      HarvestEntity,
    ]),
```

with:

```typescript
    TypeOrmModule.forFeature([UserEntity]),
```

(The `FarmEntity, CropEntity, ActivitiesEntity, HarvestEntity` imports from `@app/common` were already dropped from the import statement in Task 3, step 12 — confirm no other reference to them remains in this file.)

- [x] **Step 2: Trim `farms.module.ts`'s `forFeature`**

Replace:

```typescript
    TypeOrmModule.forFeature([
      FarmEntity,
      UserEntity,
      CropEntity,
      ActivitiesEntity,
      HarvestEntity,
      OutboxEntity,
    ]),
```

with (adding `UserProjectionEntity`, dropping `UserEntity` — the projection replaces it):

```typescript
    TypeOrmModule.forFeature([
      FarmEntity,
      CropEntity,
      ActivitiesEntity,
      HarvestEntity,
      OutboxEntity,
      UserProjectionEntity,
    ]),
```

Update the import list at the top of the file: remove `UserEntity`, add `UserProjectionEntity`.

- [x] **Step 3: Build**

Run: `pnpm build`
Expected: PASS — this is the point where the whole `auth`/`farms` split should compile cleanly end to end (Tasks 3-6 combined).

- [x] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/auth/src/auth.module.ts apps/farms/src/farms.module.ts
git commit -m "refactor: stop registering the other service's entities in auth/farms modules"
```

---

### Task 7: `auth` publishes `user.created`/`user.updated` via its own transactional outbox

**Files:**
- Create: `libs/common/src/dtos/users/userProjectionEvent.dto.ts`
- Modify: `libs/common/src/dtos/users/index.ts` (or wherever the `dtos/users` barrel lives — check with `cat libs/common/src/dtos/index.ts`)
- Create: `apps/auth/src/outbox/auth-outbox-relay.service.ts`
- Create: `apps/auth/src/outbox/auth-outbox-relay.service.spec.ts`
- Modify: `apps/auth/src/auth.module.ts`
- Modify: `apps/auth/src/auth.service.ts`
- Modify: `apps/auth/src/auth.service.spec.ts`

**Interfaces:**
- Consumes: `OutboxService.enqueue` and `BaseOutboxRelayService` from Task 1; `UserProjectionEntity` shape from Task 2 (for the event payload fields).
- Produces: RabbitMQ events `user.created` and `user.updated`, payload `{ id: number; firstName: string; lastName: string | null; email: string; rol: string | null }`, consumed by Task 8's `UserProjectionController` in `farms`.

- [x] **Step 1: Add the event payload DTO**

```typescript
// libs/common/src/dtos/users/userProjectionEvent.dto.ts
import { Allow } from 'class-validator';

// Internal event payload emitted by `auth` (user.created / user.updated) and
// consumed by `farms` to keep its local UserProjectionEntity in sync. The
// fields carry already-trusted data; @Allow() keeps them from being stripped
// by the whitelisting ValidationPipe without imposing validation on them.
export class UserProjectionEventDto {
  @Allow()
  id: number;

  @Allow()
  firstName: string;

  @Allow()
  lastName: string | null;

  @Allow()
  email: string;

  @Allow()
  rol: string | null;
}
```

Check `libs/common/src/dtos/users/index.ts` (or the equivalent barrel — run `find libs/common/src/dtos -iname "index.ts"` if unsure of the exact path) and add:

```typescript
export * from './userProjectionEvent.dto';
```

- [x] **Step 2: Register a RabbitMQ client from `auth` to `farms`, and the outbox entity, in `auth.module.ts`**

In `apps/auth/src/auth.module.ts`, add to the imports at the top:

```typescript
import { ScheduleModule } from '@nestjs/schedule';
import { OutboxEntity, OutboxService } from '@app/common';
import { AuthOutboxRelayService } from './outbox/auth-outbox-relay.service';
```

Add `ScheduleModule.forRoot()` and `RabbitmqModule.registerRmq('FARMS_SERVICE', process.env.RABBITMQ_FARMS_QUEUE)` to the `imports` array (alongside the existing `RabbitmqModule`), and add `OutboxEntity` to the `TypeOrmModule.forFeature([...])` list from Task 6:

```typescript
    TypeOrmModule.forFeature([UserEntity, OutboxEntity]),
```

and add `RabbitmqModule.registerRmq('FARMS_SERVICE', process.env.RABBITMQ_FARMS_QUEUE)` and `ScheduleModule.forRoot()` to `imports`, and `OutboxService, AuthOutboxRelayService` to `providers`.

- [x] **Step 3: `AuthOutboxRelayService`**

```typescript
// apps/auth/src/outbox/auth-outbox-relay.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BaseOutboxRelayService } from '@app/common';

@Injectable()
export class AuthOutboxRelayService extends BaseOutboxRelayService {
  protected readonly logger = new Logger(AuthOutboxRelayService.name);

  constructor(
    dataSource: DataSource,
    configService: ConfigService,
    @Inject('FARMS_SERVICE') farmsClient: ClientProxy,
  ) {
    super(dataSource, configService, farmsClient, 'AUTH_OUTBOX_RELAY_ENABLED');
  }

  @Interval('auth-outbox-relay', 3000)
  async drain(): Promise<void> {
    return super.drain();
  }
}
```

- [x] **Step 4: Test it (mirrors the base-class spec, verifying wiring only)**

```typescript
// apps/auth/src/outbox/auth-outbox-relay.service.spec.ts
import { of } from 'rxjs';
import { AuthOutboxRelayService } from './auth-outbox-relay.service';

describe('AuthOutboxRelayService', () => {
  it('drains through the base class using the AUTH_OUTBOX_RELAY_ENABLED switch', async () => {
    const config = { get: jest.fn().mockReturnValue('false') };
    const dataSource = { transaction: jest.fn() };
    const farmsClient = { emit: jest.fn().mockReturnValue(of(undefined)) };

    const service = new AuthOutboxRelayService(
      dataSource as any,
      config as any,
      farmsClient as any,
    );

    await service.drain();

    expect(config.get).toHaveBeenCalledWith('AUTH_OUTBOX_RELAY_ENABLED');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 5: Emit `user.created` in `register()`**

In `apps/auth/src/auth.service.ts`, add `DataSource` and `OutboxService` to the constructor:

```typescript
  constructor(
    @Inject('UsersRepositoryInterface')
    private readonly usersRepository: UsersRepositoryInterface,
    private readonly jwtService: JwtService,
    private s3Service: S3Service,
    private notificationsService: NotificationsService,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}
```

Add the imports:

```typescript
import { DataSource } from 'typeorm';
import { OutboxService } from '@app/common';
```

Replace the body of `register`:

```typescript
  async register(newUser: Readonly<CreateUserDto>): Promise<any> {
    const { password, ...userProperties } = newUser;
    const existingUser = await this.findByEmail(userProperties.email);

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = await this.hashPassword(password);

    const userToSave: Partial<UserEntity> = {
      ...userProperties,
      password: hashedPassword,
    };

    // Domain write + user.created event in ONE transaction (transactional
    // outbox): they commit atomically, so the event can't be lost if the
    // RabbitMQ publish later fails. AuthOutboxRelayService drains it to
    // farms out-of-band.
    const savedUser = await this.dataSource.transaction(async (manager) => {
      const created = manager.create(UserEntity, userToSave);
      const saved = await manager.save(created);
      await this.outbox.enqueue(manager, 'user.created', {
        id: saved.id,
        firstName: saved.firstName,
        lastName: saved.lastName ?? null,
        email: saved.email,
        rol: saved.rol ?? null,
      });
      return saved;
    });

    const userWithoutPassword: UserEntity = { ...savedUser };
    delete userWithoutPassword.password;

    await this.notificationsService.welcomeEmail(
      userWithoutPassword.email,
      `${userWithoutPassword.firstName} ${userWithoutPassword.lastName}`,
    );

    return {
      user: userWithoutPassword,
      message: 'User created successfully',
      status: 'success',
    };
  }
```

- [x] **Step 6: Emit `user.updated` in `updateUserInfo()`**

Replace the body of `updateUserInfo`:

```typescript
  async updateUserInfo(userId: any, updatedData: UpdateUserDto): Promise<any> {
    const user = await this.usersRepository.findOneById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    for (const key in updatedData) {
      if (updatedData.hasOwnProperty(key)) {
        user[key] = updatedData[key];
      }
    }

    // Domain write + user.updated event in one transaction (transactional
    // outbox) — see register() for why.
    const savedUser = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(UserEntity, user);
      await this.outbox.enqueue(manager, 'user.updated', {
        id: saved.id,
        firstName: saved.firstName,
        lastName: saved.lastName ?? null,
        email: saved.email,
        rol: saved.rol ?? null,
      });
      return saved;
    });

    return savedUser;
  }
```

- [x] **Step 7: Update `auth.service.spec.ts` for the new constructor and rewritten `register`**

In `apps/auth/src/auth.service.spec.ts`, add test doubles and pass them to the constructor:

```typescript
  let dataSource: { transaction: jest.Mock };
  let outbox: { enqueue: jest.Mock };
```

In `beforeEach`, add:

```typescript
    outbox = { enqueue: jest.fn() };
    dataSource = {
      transaction: jest.fn((cb) =>
        cb({
          create: (_entity: any, data: any) => data,
          save: async (data: any) => ({ id: 7, ...data }),
        }),
      ),
    };

    service = new AuthService(
      usersRepository as any,
      jwtService as any,
      s3Service,
      notificationsService as any,
      redisService as any,
      dataSource as any,
      outbox as any,
    );
```

Update the `register` test that inspected `usersRepository.save.mock.calls` — replace:

```typescript
    it('hashes the password, saves the user, and sends the welcome email', async () => {
      usersRepository.findByCondition.mockResolvedValue(null);
      usersRepository.save.mockImplementation(async (u) => ({ id: 7, ...u }));

      const result = await service.register({
        email: 'new@example.com',
        firstName: 'Ana',
        lastName: 'Diaz',
        password: 'plain',
      } as any);

      const saved = usersRepository.save.mock.calls[0][0];
      expect(saved.password).not.toEqual('plain');
      expect(result.status).toBe('success');
      expect(result.user.password).toBeUndefined();
      expect(notificationsService.welcomeEmail).toHaveBeenCalledWith(
        'new@example.com',
        'Ana Diaz',
      );
    });
```

with:

```typescript
    it('hashes the password, saves the user in a transaction, enqueues user.created, and sends the welcome email', async () => {
      usersRepository.findByCondition.mockResolvedValue(null);

      const result = await service.register({
        email: 'new@example.com',
        firstName: 'Ana',
        lastName: 'Diaz',
        password: 'plain',
      } as any);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      const [, pattern, payload] = outbox.enqueue.mock.calls[0];
      expect(pattern).toBe('user.created');
      expect(payload).toEqual(
        expect.objectContaining({ id: 7, email: 'new@example.com' }),
      );
      expect(result.status).toBe('success');
      expect(result.user.password).toBeUndefined();
      expect(notificationsService.welcomeEmail).toHaveBeenCalledWith(
        'new@example.com',
        'Ana Diaz',
      );
    });
```

- [x] **Step 8: Run the auth test suite**

Run: `npx jest apps/auth`
Expected: PASS.

- [x] **Step 9: Build**

Run: `pnpm build`
Expected: PASS.

- [x] **Step 10: Commit**

```bash
git add libs/common/src/dtos/users apps/auth/src/outbox apps/auth/src/auth.module.ts apps/auth/src/auth.service.ts apps/auth/src/auth.service.spec.ts
git commit -m "feat: auth publishes user.created/user.updated via its own transactional outbox"
```

---

### Task 8: `farms` consumes `user.created`/`user.updated` into `UserProjectionEntity`

**Files:**
- Create: `apps/farms/src/user-projection/user-projection.service.ts`
- Create: `apps/farms/src/user-projection/user-projection.service.spec.ts`
- Create: `apps/farms/src/user-projection/user-projection.controller.ts`
- Modify: `apps/farms/src/farms.module.ts`

**Interfaces:**
- Consumes: `UserProjectionEventDto` (Task 7), `UserProjectionEntity` (Task 2).
- Produces: `UserProjectionService.upsert(data: UserProjectionEventDto): Promise<void>` — idempotent by `id`, used by Task 9's `report.service.ts`.

- [x] **Step 1: `UserProjectionService`**

```typescript
// apps/farms/src/user-projection/user-projection.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProjectionEntity, UserProjectionEventDto } from '@app/common';

// Consumer-side of the auth -> farms event-carried read model. `upsert` is
// keyed on `id`, so a redelivered user.created/user.updated event converges
// instead of duplicating or corrupting the row.
@Injectable()
export class UserProjectionService {
  constructor(
    @InjectRepository(UserProjectionEntity)
    private readonly repository: Repository<UserProjectionEntity>,
  ) {}

  async upsert(data: UserProjectionEventDto): Promise<void> {
    await this.repository.upsert(
      {
        id: data.id,
        firstName: data.firstName,
        lastName: data.lastName ?? null,
        email: data.email,
        rol: data.rol ?? null,
      },
      ['id'],
    );
  }
}
```

- [x] **Step 2: Test idempotency**

```typescript
// apps/farms/src/user-projection/user-projection.service.spec.ts
import { UserProjectionService } from './user-projection.service';

describe('UserProjectionService', () => {
  let repository: { upsert: jest.Mock };
  let service: UserProjectionService;

  beforeEach(() => {
    repository = { upsert: jest.fn() };
    service = new UserProjectionService(repository as any);
  });

  it('upserts by id on user.created', async () => {
    await service.upsert({
      id: 1,
      firstName: 'Ana',
      lastName: 'Diaz',
      email: 'ana@example.com',
      rol: 'farmer',
    });

    expect(repository.upsert).toHaveBeenCalledWith(
      {
        id: 1,
        firstName: 'Ana',
        lastName: 'Diaz',
        email: 'ana@example.com',
        rol: 'farmer',
      },
      ['id'],
    );
  });

  it('converges instead of duplicating when the same event is redelivered', async () => {
    const event = {
      id: 1,
      firstName: 'Ana',
      lastName: 'Diaz',
      email: 'ana@example.com',
      rol: 'farmer',
    };

    await service.upsert(event);
    await service.upsert(event);

    expect(repository.upsert).toHaveBeenCalledTimes(2);
    // Both calls target the same row (same `id` conflict key) — a real
    // Postgres upsert would leave exactly one row; this asserts the
    // conflict key used to guarantee that.
    expect(repository.upsert.mock.calls[0][1]).toEqual(['id']);
    expect(repository.upsert.mock.calls[1][1]).toEqual(['id']);
  });

  it('applies an update on user.updated the same way', async () => {
    await service.upsert({
      id: 1,
      firstName: 'Ana',
      lastName: 'Diaz',
      email: 'ana@example.com',
      rol: 'admin', // promoted
    });

    expect(repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, rol: 'admin' }),
      ['id'],
    );
  });
});
```

- [x] **Step 3: `UserProjectionController`**

```typescript
// apps/farms/src/user-projection/user-projection.controller.ts
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { UserProjectionEventDto } from '@app/common';
import { UserProjectionService } from './user-projection.service';

// Acking is handled globally by RmqReliabilityInterceptor (ack after
// processing; events nack-to-DLQ on error).
@Controller()
export class UserProjectionController {
  constructor(private readonly userProjectionService: UserProjectionService) {}

  @EventPattern('user.created')
  async handleUserCreated(@Payload() data: UserProjectionEventDto) {
    await this.userProjectionService.upsert(data);
  }

  @EventPattern('user.updated')
  async handleUserUpdated(@Payload() data: UserProjectionEventDto) {
    await this.userProjectionService.upsert(data);
  }
}
```

- [x] **Step 4: Register in `farms.module.ts`**

Add the imports:

```typescript
import { UserProjectionController } from './user-projection/user-projection.controller';
import { UserProjectionService } from './user-projection/user-projection.service';
```

Add `UserProjectionController` to `controllers`, and `UserProjectionService` to `providers`.

- [x] **Step 5: Run the new tests, build**

Run: `npx jest apps/farms/src/user-projection && pnpm build`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/farms/src/user-projection apps/farms/src/farms.module.ts
git commit -m "feat: farms consumes user.created/user.updated into a local UserProjectionEntity"
```

---

### Task 9: Rewrite `report.service.ts` to use `FarmEntity`/`UserProjectionEntity`

**Files:**
- Modify: `apps/farms/src/report/report.service.ts`
- Modify: `apps/farms/src/report/report.service.spec.ts`
- Modify: `apps/farms/src/farms.module.ts` (no change needed — `FarmEntity`/`UserProjectionEntity` already registered by Tasks 3/6/8; verify)

**Interfaces:**
- Consumes: `FarmEntity.userId`, `UserProjectionEntity` (id/firstName/lastName/email/rol).
- Produces: admin report shape `{ result: Array<{ owner: { id, firstName, lastName, email, rol } | { id }, farms: Array<Farm & { crops: Array<Crop & { activities, harvests }> }> }>, status }` — a documented shape change from the old array-of-`User`.

- [x] **Step 1: Rewrite the service**

```typescript
// apps/farms/src/report/report.service.ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository } from 'typeorm';

import { FarmEntity, RedisService, Role, UserProjectionEntity } from '@app/common';

// Reports are cached briefly — they are expensive and rarely need to be
// second-fresh. Keys are per-scope so a farmer's cache can't leak across users.
const REPORT_CACHE_TTL_SECONDS = 60;
const ADMIN_REPORT_KEY = 'report:admin';
const farmerReportKey = (farmerId: number) => `report:farmer:${farmerId}`;

// The whole ownership tree, loaded in a fixed number of queries (one per depth)
// instead of a per-farm/-crop N+1 walk. `FarmEntity` is the root now — `users`
// lives in a different database, so the tree can no longer start there.
const FARM_REPORT_RELATIONS = ['crops', 'crops.activities', 'crops.harvest'];

interface OwnerSummary {
  id: number;
  firstName?: string;
  lastName?: string | null;
  email?: string;
  rol?: string | null;
}

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(FarmEntity)
    private farmsRepository: Repository<FarmEntity>,
    @InjectRepository(UserProjectionEntity)
    private userProjectionRepository: Repository<UserProjectionEntity>,
    private readonly redisService: RedisService,
  ) {}

  async generateAdminReport(req_id: number) {
    const requester = await this.userProjectionRepository.findOne({
      where: { id: req_id },
    });
    // Defence in depth: the gateway RolesGuard is the primary check, but a
    // message put straight on the queue must not bypass it. This now checks
    // farms' own (eventually consistent) copy of the role, not auth's `users`
    // table directly — see the Phase 5 design spec for the trade-off.
    if (requester?.rol !== Role.Admin) {
      throw new ForbiddenException('Admin role required');
    }

    const cached = await this.redisService.get(ADMIN_REPORT_KEY);
    if (cached) {
      return { result: JSON.parse(cached), status: 'success' };
    }

    const farms = await this.farmsRepository.find({
      relations: FARM_REPORT_RELATIONS,
      relationLoadStrategy: 'query',
    });
    const owners = await this.userProjectionRepository.find();
    const ownerById = new Map(owners.map((owner) => [owner.id, owner]));

    const result = this.groupByOwner(farms, ownerById);

    await this.redisService.setWithTtl(
      ADMIN_REPORT_KEY,
      JSON.stringify(result),
      REPORT_CACHE_TTL_SECONDS,
    );
    return { result, status: 'success' };
  }

  async generateFarmerReport(farmer_id: number, req_id: number) {
    // A farmer can only pull their own report.
    if (farmer_id !== req_id) {
      throw new ForbiddenException('You can only access your own report');
    }

    const cacheKey = farmerReportKey(farmer_id);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return { result: JSON.parse(cached), status: 'success' };
    }

    const farms = await this.farmsRepository.find({
      where: { userId: Equal(farmer_id) },
      relations: FARM_REPORT_RELATIONS,
      relationLoadStrategy: 'query',
    });

    const result = farms.map((farm) => this.shapeFarm(farm));

    await this.redisService.setWithTtl(
      cacheKey,
      JSON.stringify(result),
      REPORT_CACHE_TTL_SECONDS,
    );
    return { result, status: 'success' };
  }

  private groupByOwner(
    farms: FarmEntity[],
    ownerById: Map<number, UserProjectionEntity>,
  ): Array<{ owner: OwnerSummary; farms: unknown[] }> {
    const byOwner = new Map<number, { owner: OwnerSummary; farms: unknown[] }>();

    for (const farm of farms) {
      if (!byOwner.has(farm.userId)) {
        const owner = ownerById.get(farm.userId);
        byOwner.set(farm.userId, {
          owner: owner
            ? {
                id: owner.id,
                firstName: owner.firstName,
                lastName: owner.lastName,
                email: owner.email,
                rol: owner.rol,
              }
            : { id: farm.userId },
          farms: [],
        });
      }
      byOwner.get(farm.userId)!.farms.push(this.shapeFarm(farm));
    }

    return Array.from(byOwner.values());
  }

  // Normalise the entity's `crop.harvest` relation to the `crop.harvests` the
  // report writer expects.
  private shapeFarm(farm: FarmEntity) {
    return {
      ...farm,
      crops: (farm.crops ?? []).map((crop: any) => ({
        ...crop,
        activities: crop.activities ?? [],
        harvests: crop.harvest ?? [],
      })),
    };
  }
}
```

- [x] **Step 2: Rewrite the spec against the new shape**

```typescript
// apps/farms/src/report/report.service.spec.ts
import { ForbiddenException } from '@nestjs/common';
import { ReportService } from './report.service';

describe('ReportService', () => {
  let farmsRepository: { find: jest.Mock };
  let userProjectionRepository: { findOne: jest.Mock; find: jest.Mock };
  let redis: { get: jest.Mock; setWithTtl: jest.Mock };
  let service: ReportService;

  beforeEach(() => {
    farmsRepository = { find: jest.fn() };
    userProjectionRepository = { findOne: jest.fn(), find: jest.fn() };
    redis = { get: jest.fn().mockResolvedValue(null), setWithTtl: jest.fn() };
    service = new ReportService(
      farmsRepository as any,
      userProjectionRepository as any,
      redis as any,
    );
  });

  describe('generateAdminReport', () => {
    it('throws ForbiddenException for a non-admin', async () => {
      userProjectionRepository.findOne.mockResolvedValue({
        id: 1,
        rol: 'farmer',
      });
      await expect(service.generateAdminReport(1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('groups farms by owner, using the local user_projection for owner metadata, and caches it', async () => {
      userProjectionRepository.findOne.mockResolvedValue({
        id: 1,
        rol: 'admin',
      });
      userProjectionRepository.find.mockResolvedValue([
        { id: 5, firstName: 'Ana', lastName: 'Diaz', email: 'a@x.com', rol: 'farmer' },
      ]);
      farmsRepository.find.mockResolvedValue([
        {
          id: 1,
          userId: 5,
          crops: [{ id: 1, activities: [], harvest: [] }],
        },
      ]);

      const result = await service.generateAdminReport(1);

      expect(farmsRepository.find).toHaveBeenCalledTimes(1);
      expect(farmsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: expect.arrayContaining(['crops.activities']),
          relationLoadStrategy: 'query',
        }),
      );
      expect(result.result).toEqual([
        expect.objectContaining({
          owner: expect.objectContaining({ id: 5, firstName: 'Ana' }),
          farms: [
            expect.objectContaining({
              id: 1,
              crops: [expect.objectContaining({ harvests: [] })],
            }),
          ],
        }),
      ]);
      expect(redis.setWithTtl).toHaveBeenCalledWith(
        'report:admin',
        expect.any(String),
        expect.any(Number),
      );
    });

    it('falls back to a bare owner id when no projection row exists yet (eventual consistency)', async () => {
      userProjectionRepository.findOne.mockResolvedValue({
        id: 1,
        rol: 'admin',
      });
      userProjectionRepository.find.mockResolvedValue([]);
      farmsRepository.find.mockResolvedValue([
        { id: 1, userId: 9, crops: [] },
      ]);

      const result = await service.generateAdminReport(1);

      expect(result.result[0].owner).toEqual({ id: 9 });
    });

    it('returns the cached report without querying when present', async () => {
      userProjectionRepository.findOne.mockResolvedValue({
        id: 1,
        rol: 'admin',
      });
      redis.get.mockResolvedValue(JSON.stringify([{ owner: { id: 1 }, farms: [] }]));

      const result = await service.generateAdminReport(1);

      expect(farmsRepository.find).not.toHaveBeenCalled();
      expect(result.result[0].owner.id).toBe(1);
    });
  });

  describe('generateFarmerReport', () => {
    it('throws ForbiddenException when requesting another farmer', async () => {
      await expect(service.generateFarmerReport(2, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns the farms tree for the requester and caches it', async () => {
      farmsRepository.find.mockResolvedValue([
        { id: 1, userId: 1, crops: [] },
      ]);

      const result = await service.generateFarmerReport(1, 1);

      expect(farmsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ relationLoadStrategy: 'query' }),
      );
      expect(Array.isArray(result.result)).toBe(true);
      expect(redis.setWithTtl).toHaveBeenCalledWith(
        'report:farmer:1',
        expect.any(String),
        expect.any(Number),
      );
    });
  });
});
```

- [x] **Step 3: Run the report tests, build, and the full suite**

Run: `npx jest apps/farms/src/report && pnpm build && pnpm test`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add apps/farms/src/report
git commit -m "refactor: report.service reads FarmEntity/UserProjectionEntity, no cross-service User query"
```

---

### Task 10: `docker-compose.yml` — split Postgres into `postgres-auth`/`postgres-farms`

**Files:**
- Modify: `docker-compose.yml`

- [x] **Step 1: Replace the single `postgres` service with two, and repoint `auth`/`farms`**

Replace:

```yaml
  auth:
    build:
      context: ./
      dockerfile: ./apps/auth/Dockerfile
      target: builder
    depends_on:
      - rabbitmq
      - postgres
      - minio
    environment:
      # auth owns running the DB migrations (overrides the .env default).
      - DB_RUN_MIGRATIONS=true
    volumes:
      - .:/usr/src/app # any change to base folder should be reflected
      - /usr/src/app/node_modules
    command: pnpm run start:dev auth

  farms:
    build:
      context: ./
      dockerfile: ./apps/farms/Dockerfile
      target: builder
    depends_on:
      - gateway
      - rabbitmq
      - postgres
      - minio
    volumes:
      - .:/usr/src/app # any change to base folder should be reflected
      - /usr/src/app/node_modules
    command: pnpm run start:dev farms
```

with:

```yaml
  auth:
    build:
      context: ./
      dockerfile: ./apps/auth/Dockerfile
      target: builder
    depends_on:
      - rabbitmq
      - postgres-auth
      - minio
    environment:
      # Each service now owns its own database, so each safely runs its own
      # migrations (overrides the .env default).
      - DB_RUN_MIGRATIONS=true
    volumes:
      - .:/usr/src/app # any change to base folder should be reflected
      - /usr/src/app/node_modules
    command: pnpm run start:dev auth

  farms:
    build:
      context: ./
      dockerfile: ./apps/farms/Dockerfile
      target: builder
    depends_on:
      - gateway
      - rabbitmq
      - postgres-farms
      - minio
    environment:
      - DB_RUN_MIGRATIONS=true
    volumes:
      - .:/usr/src/app # any change to base folder should be reflected
      - /usr/src/app/node_modules
    command: pnpm run start:dev farms
```

Replace:

```yaml
  postgres:
    image: "postgres:latest"
    env_file:
      - ./.env
    ports:
      - "5432:5432"
    volumes:
      - ./pg_data:/var/lib/postgresql/data

  postgres_admin:
    image: dpage/pgadmin4
    depends_on:
      - postgres
    env_file:
      - .env
    ports:
      - '15432:80'
```

with:

```yaml
  postgres-auth:
    image: "postgres:latest"
    env_file:
      - ./.env
    environment:
      - POSTGRES_DB=${AUTH_POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - ./pg_data_auth:/var/lib/postgresql/data

  postgres-farms:
    image: "postgres:latest"
    env_file:
      - ./.env
    environment:
      - POSTGRES_DB=${FARMS_POSTGRES_DB}
    ports:
      - "5433:5432"
    volumes:
      - ./pg_data_farms:/var/lib/postgresql/data

  postgres_admin:
    image: dpage/pgadmin4
    depends_on:
      - postgres-auth
      - postgres-farms
    env_file:
      - .env
    ports:
      - '15432:80'
```

- [x] **Step 2: Add the new local data dirs to `.gitignore` if `pg_data` is already listed**

Run: `grep -n "pg_data" .gitignore`
If it lists `pg_data`, add `pg_data_auth` and `pg_data_farms` next to it (or replace the single entry with a glob `pg_data*` — check the existing entry's style and match it).

- [x] **Step 3: Smoke-test the compose stack**

Run: `docker compose up --build -d postgres-auth postgres-farms rabbitmq redis mongo minio minio_createbucket && docker compose up --build auth farms gateway tracing`
Expected: all containers start; `auth` and `farms` connect to their respective Postgres without error; farm→crop→activity→harvest flow works via Swagger; a new user shows up in `farms`' `user_projection` table shortly after registering (verify with `docker compose exec postgres-farms psql -U user -d harvestledger_farms -c 'select * from user_projection;'`).

- [x] **Step 4: Commit**

```bash
git add docker-compose.yml .gitignore
git commit -m "infra: split docker-compose Postgres into postgres-auth/postgres-farms"
```

---

### Task 11: Kubernetes manifests — two Postgres StatefulSets, per-service DB config

**Files:**
- Create: `k8s/11-postgres-farms.yaml`
- Modify: `k8s/10-postgres.yaml` (rename in place to become the auth-only StatefulSet — see step 1)
- Modify: `k8s/01-config.yaml`
- Modify: `k8s/21-auth.yaml`
- Modify: `k8s/22-farms.yaml`

- [x] **Step 1: Rewrite `k8s/10-postgres.yaml` as `postgres-auth`**

Replace the whole file content:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres-auth
  namespace: harvestledger
spec:
  selector:
    app: postgres-auth
  ports:
    - port: 5432
      targetPort: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres-auth
  namespace: harvestledger
spec:
  serviceName: postgres-auth
  replicas: 1
  selector:
    matchLabels:
      app: postgres-auth
  template:
    metadata:
      labels:
        app: postgres-auth
    spec:
      containers:
        - name: postgres
          image: postgres:16
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_USER
              value: "user"
            - name: POSTGRES_PASSWORD
              value: "password"
            - name: POSTGRES_DB
              value: "harvestledger_auth"
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "user", "-d", "harvestledger_auth"]
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              cpu: "100m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
```

Rename the file: `git mv k8s/10-postgres.yaml k8s/10-postgres-auth.yaml`.

- [x] **Step 2: Create `k8s/11-postgres-farms.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres-farms
  namespace: harvestledger
spec:
  selector:
    app: postgres-farms
  ports:
    - port: 5432
      targetPort: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres-farms
  namespace: harvestledger
spec:
  serviceName: postgres-farms
  replicas: 1
  selector:
    matchLabels:
      app: postgres-farms
  template:
    metadata:
      labels:
        app: postgres-farms
    spec:
      containers:
        - name: postgres
          image: postgres:16
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_USER
              value: "user"
            - name: POSTGRES_PASSWORD
              value: "password"
            - name: POSTGRES_DB
              value: "harvestledger_farms"
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "user", "-d", "harvestledger_farms"]
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              cpu: "100m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
```

- [x] **Step 3: Update `k8s/01-config.yaml`**

Remove the `POSTGRES_URI` line from the shared `harvestledger-config` ConfigMap, then add two small per-service ConfigMaps carrying just the connection string (kept out of the shared one, since it is the one thing that now genuinely differs per service):

```yaml
data:
  RABBITMQ_HOST: "rabbitmq:5672"
  RABBITMQ_AUTH_QUEUE: "auth_queue"
  RABBITMQ_FARMS_QUEUE: "farms_queue"
  RABBITMQ_TRACING_QUEUE: "tracing_queue"
  MONGO_URI: "mongodb://mongo:27017/harvestledger"
  REDIS_URL: "redis://redis:6379"
  S3_REGION: "us-east-1"
  S3_BUCKET: "harvestledger-bucket"
  S3_ENDPOINT: "http://minio:9000"
  HEALTH_PORT: "3000"
  CORS_ORIGINS: "http://localhost:3000"
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://jaeger.monitoring.svc:4318"
  # Default: services do not run migrations. auth and farms override this
  # (below) — each now owns its own database.
  DB_RUN_MIGRATIONS: "false"
  OUTBOX_RELAY_ENABLED: "true"
  AUTH_OUTBOX_RELAY_ENABLED: "true"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: harvestledger-auth-db-config
  namespace: harvestledger
data:
  AUTH_POSTGRES_URI: "postgresql://user:password@postgres-auth:5432/harvestledger_auth"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: harvestledger-farms-db-config
  namespace: harvestledger
data:
  FARMS_POSTGRES_URI: "postgresql://user:password@postgres-farms:5432/harvestledger_farms"
```

(Keep the existing `Secret` block in the same file unchanged.)

- [x] **Step 4: Add the per-service DB ConfigMap to `k8s/21-auth.yaml`**

Replace:

```yaml
          envFrom:
            - configMapRef:
                name: harvestledger-config
            - secretRef:
                name: harvestledger-secret
```

with:

```yaml
          envFrom:
            - configMapRef:
                name: harvestledger-config
            - configMapRef:
                name: harvestledger-auth-db-config
            - secretRef:
                name: harvestledger-secret
```

- [x] **Step 5: Add the per-service DB ConfigMap and migration flag to `k8s/22-farms.yaml`**

Replace:

```yaml
          env:
            - name: OTEL_SERVICE_NAME
              value: farms
          envFrom:
            - configMapRef:
                name: harvestledger-config
            - secretRef:
                name: harvestledger-secret
```

with:

```yaml
          env:
            - name: OTEL_SERVICE_NAME
              value: farms
            # farms now owns its own database too — runs its own migrations.
            - name: DB_RUN_MIGRATIONS
              value: "true"
          envFrom:
            - configMapRef:
                name: harvestledger-config
            - configMapRef:
                name: harvestledger-farms-db-config
            - secretRef:
                name: harvestledger-secret
```

- [x] **Step 6: Apply to a `kind` cluster and verify**

Run: `kubectl apply -f k8s/ && kubectl -n harvestledger get pods -w`
Expected: `postgres-auth-0` and `postgres-farms-0` both reach `Running`/`Ready`; `auth` and `farms` deployments reach `Ready` (readiness probe on `/health` green); `kubectl -n harvestledger exec -it postgres-farms-0 -- psql -U user -d harvestledger_farms -c '\dt'` shows `farms, crops, activities, harvests, outbox, user_projection` and **not** `users`; the equivalent on `postgres-auth-0` shows `users, outbox` and none of the farms tables.

- [x] **Step 7: Commit**

```bash
git add k8s/
git commit -m "infra: split k8s Postgres into postgres-auth/postgres-farms StatefulSets"
```

---

### Task 12: Helm chart — two Postgres backends, per-worker DB config

**Files:**
- Modify: `helm/values.yaml`
- Modify: `helm/templates/config.yaml` (verify only — it already just ranges over `.Values.config`, no change needed if Step 1 removes `POSTGRES_URI` from that map)
- Modify: `helm/templates/backends.yaml`
- Modify: `helm/templates/workers.yaml`

- [x] **Step 1: Update `helm/values.yaml`**

Replace:

```yaml
config:
  RABBITMQ_HOST: "rabbitmq:5672"
  RABBITMQ_AUTH_QUEUE: "auth_queue"
  RABBITMQ_FARMS_QUEUE: "farms_queue"
  RABBITMQ_TRACING_QUEUE: "tracing_queue"
  POSTGRES_URI: "postgresql://user:password@postgres:5432/harvestledger"
  MONGO_URI: "mongodb://mongo:27017/harvestledger"
  REDIS_URL: "redis://redis:6379"
  S3_REGION: "us-east-1"
  S3_BUCKET: "harvestledger-bucket"
  S3_ENDPOINT: "http://minio:9000"
  HEALTH_PORT: "3000"
  CORS_ORIGINS: "http://localhost:3000"
  # Default: services do not migrate. The `migrationsWorker` overrides this.
  DB_RUN_MIGRATIONS: "false"
```

with:

```yaml
config:
  RABBITMQ_HOST: "rabbitmq:5672"
  RABBITMQ_AUTH_QUEUE: "auth_queue"
  RABBITMQ_FARMS_QUEUE: "farms_queue"
  RABBITMQ_TRACING_QUEUE: "tracing_queue"
  MONGO_URI: "mongodb://mongo:27017/harvestledger"
  REDIS_URL: "redis://redis:6379"
  S3_REGION: "us-east-1"
  S3_BUCKET: "harvestledger-bucket"
  S3_ENDPOINT: "http://minio:9000"
  HEALTH_PORT: "3000"
  CORS_ORIGINS: "http://localhost:3000"
  # Default: services do not migrate. `migrationsWorkers` overrides this per worker.
  DB_RUN_MIGRATIONS: "false"
```

Replace:

```yaml
# Which worker runs the DB migrations on startup (the others don't, to avoid
# racing). Set to "" to disable in-app migrations entirely (run them out-of-band).
migrationsWorker: auth
```

with:

```yaml
# Which workers run their own DB migrations on startup. Each now owns its own
# database, so both can safely migrate — this is no longer about avoiding a
# race, just an explicit opt-in list. Set to [] to disable in-app migrations
# entirely (run them out-of-band).
migrationsWorkers:
  - auth
  - farms

# Per-worker Postgres connection info — only workers listed here get a
# POSTGRES_URI-equivalent env var injected (see workers.yaml).
postgres:
  auth:
    envKey: AUTH_POSTGRES_URI
    uri: "postgresql://user:password@postgres-auth:5432/harvestledger_auth"
    db: "harvestledger_auth"
  farms:
    envKey: FARMS_POSTGRES_URI
    uri: "postgresql://user:password@postgres-farms:5432/harvestledger_farms"
    db: "harvestledger_farms"
```

Replace the `backends.postgres` block:

```yaml
backends:
  postgres:
    enabled: true
    image: postgres:16
    storage: 1Gi
```

with:

```yaml
backends:
  postgresAuth:
    enabled: true
    image: postgres:16
    storage: 1Gi
  postgresFarms:
    enabled: true
    image: postgres:16
    storage: 1Gi
```

- [x] **Step 2: Replace the single `postgres` block in `helm/templates/backends.yaml` with two**

Replace:

```yaml
{{- if .Values.backends.postgres.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  selector: { app: postgres }
  ports:
    - port: 5432
      targetPort: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels: { app: postgres }
  template:
    metadata:
      labels: { app: postgres }
    spec:
      containers:
        - name: postgres
          image: {{ .Values.backends.postgres.image }}
          ports:
            - containerPort: 5432
          env:
            - { name: POSTGRES_USER, value: "user" }
            - { name: POSTGRES_PASSWORD, value: "password" }
            - { name: POSTGRES_DB, value: "harvestledger" }
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "user", "-d", "harvestledger"]
            initialDelaySeconds: 5
            periodSeconds: 10
          volumeMounts:
            - { name: data, mountPath: /var/lib/postgresql/data }
  volumeClaimTemplates:
    - metadata: { name: data }
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: {{ .Values.backends.postgres.storage }}
{{- end }}
```

with:

```yaml
{{- if .Values.backends.postgresAuth.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: postgres-auth
spec:
  selector: { app: postgres-auth }
  ports:
    - port: 5432
      targetPort: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres-auth
spec:
  serviceName: postgres-auth
  replicas: 1
  selector:
    matchLabels: { app: postgres-auth }
  template:
    metadata:
      labels: { app: postgres-auth }
    spec:
      containers:
        - name: postgres
          image: {{ .Values.backends.postgresAuth.image }}
          ports:
            - containerPort: 5432
          env:
            - { name: POSTGRES_USER, value: "user" }
            - { name: POSTGRES_PASSWORD, value: "password" }
            - { name: POSTGRES_DB, value: {{ .Values.postgres.auth.db | quote }} }
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "user", "-d", {{ .Values.postgres.auth.db | quote }}]
            initialDelaySeconds: 5
            periodSeconds: 10
          volumeMounts:
            - { name: data, mountPath: /var/lib/postgresql/data }
  volumeClaimTemplates:
    - metadata: { name: data }
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: {{ .Values.backends.postgresAuth.storage }}
{{- end }}
{{- if .Values.backends.postgresFarms.enabled }}
---
apiVersion: v1
kind: Service
metadata:
  name: postgres-farms
spec:
  selector: { app: postgres-farms }
  ports:
    - port: 5432
      targetPort: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres-farms
spec:
  serviceName: postgres-farms
  replicas: 1
  selector:
    matchLabels: { app: postgres-farms }
  template:
    metadata:
      labels: { app: postgres-farms }
    spec:
      containers:
        - name: postgres
          image: {{ .Values.backends.postgresFarms.image }}
          ports:
            - containerPort: 5432
          env:
            - { name: POSTGRES_USER, value: "user" }
            - { name: POSTGRES_PASSWORD, value: "password" }
            - { name: POSTGRES_DB, value: {{ .Values.postgres.farms.db | quote }} }
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "user", "-d", {{ .Values.postgres.farms.db | quote }}]
            initialDelaySeconds: 5
            periodSeconds: 10
          volumeMounts:
            - { name: data, mountPath: /var/lib/postgresql/data }
  volumeClaimTemplates:
    - metadata: { name: data }
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: {{ .Values.backends.postgresFarms.storage }}
{{- end }}
```

(Leave the `mongo`, `redis`, `rabbitmq` blocks below this untouched.)

- [x] **Step 3: Update `helm/templates/workers.yaml`**

Replace:

```yaml
          envFrom:
            - configMapRef:
                name: harvestledger-config
            - secretRef:
                name: harvestledger-secret
          {{- if eq $worker $.Values.migrationsWorker }}
          env:
            # This worker owns running the DB migrations (overrides the ConfigMap).
            - name: DB_RUN_MIGRATIONS
              value: "true"
          {{- end }}
```

with:

```yaml
          envFrom:
            - configMapRef:
                name: harvestledger-config
            - secretRef:
                name: harvestledger-secret
          {{- if hasKey $.Values.postgres $worker }}
          env:
            - name: {{ (index $.Values.postgres $worker).envKey }}
              value: {{ (index $.Values.postgres $worker).uri | quote }}
            {{- if has $worker $.Values.migrationsWorkers }}
            # This worker owns its own database and runs its own migrations.
            - name: DB_RUN_MIGRATIONS
              value: "true"
            {{- end }}
          {{- else if has $worker $.Values.migrationsWorkers }}
          env:
            - name: DB_RUN_MIGRATIONS
              value: "true"
          {{- end }}
```

- [x] **Step 4: Render and validate the chart**

Run: `helm template helm/ | kubectl apply --dry-run=client -f -`
Expected: no template errors; the rendered output shows `postgres-auth`/`postgres-farms` StatefulSets and Services, and the `auth`/`farms` Deployments each carry exactly one of `AUTH_POSTGRES_URI`/`FARMS_POSTGRES_URI` plus `DB_RUN_MIGRATIONS: "true"`, while `tracing`'s Deployment carries neither.

- [x] **Step 5: Install on the `kind` cluster and verify**

Run: `helm upgrade --install harvestledger helm/ -n harvestledger --create-namespace && kubectl -n harvestledger get pods -w`
Expected: same verification as Task 11, Step 6, now via the chart.

- [x] **Step 6: Commit**

```bash
git add helm/
git commit -m "infra: split Helm Postgres backend into postgres-auth/postgres-farms"
```

---

### Task 13: Full verification pass and documentation update

**Files:**
- Modify: `ROADMAP.md`
- Modify: `README.md`

**Interfaces:** none — this task only verifies and documents.

- [x] **Step 1: Full local verification**

Run: `pnpm build && pnpm lint:check && pnpm test:cov`
Expected: all green; coverage thresholds in `package.json` still met (re-check `apps/farms/src/report/report.service.ts` and `apps/farms/src/ownership/ownership.service.ts` aren't in `collectCoverageFrom` today — no threshold change needed unless the run reports otherwise).

- [x] **Step 2: IDOR regression check**

Confirm the existing cross-user IDOR e2e/behavior (user A requests user B's `cropId` → 403) still holds with zero access to `users` — this is a natural consequence of Task 5 but must be exercised once end-to-end (via the `kind` cluster from Task 11 or `docker-compose` from Task 10): register two users, create a farm/crop as user A, attempt to read/update it as user B, confirm `403 Forbidden`.

- [x] **Step 3: Consistency drill**

On the `kind` cluster (or docker-compose): register a user, immediately `kubectl -n harvestledger delete pod -l app=farms` (or `docker compose kill farms`) before the projection likely lands, restart it, and confirm `user_projection` in `postgres-farms` eventually contains the new user (the event was durable in auth's outbox, not lost). Then manually re-emit the same `user.created` payload (e.g. via the RabbitMQ management UI) and confirm the row count for that `id` in `user_projection` stays at one.

- [x] **Step 4: Update `ROADMAP.md`**

In the Phase 5 bullet list, replace:

```markdown
  - ⬜ **One database per service** — split the Postgres shared by `auth`/`farms`; cross-context data travels by message.
```

with:

```markdown
  - ✅ **One database per service** — `auth` and `farms` each own a Postgres instance; `farms` keeps a local, event-fed `user_projection` read model instead of joining `users`.
```

- [x] **Step 5: Update `README.md`**

Update the "Is/Going" summary line and the Phase 5 bullet list (mirroring the `ROADMAP.md` change) to reflect that database-per-service is done and only "a new service" remains for Phase 5. Locate the two spots via `grep -n "one-DB-per-service\|One database per service" README.md` and edit both to match the new state.

- [x] **Step 6: Commit**

```bash
git add ROADMAP.md README.md
git commit -m "docs: mark Phase 5 database-per-service split as done"
```
