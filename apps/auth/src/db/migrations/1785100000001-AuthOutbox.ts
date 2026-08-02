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
