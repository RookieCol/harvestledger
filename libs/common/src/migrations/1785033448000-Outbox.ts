import { MigrationInterface, QueryRunner } from 'typeorm';

// Transactional outbox table (see OutboxEntity). Written alongside domain rows
// in one transaction; drained to RabbitMQ by the farms relay.
export class Outbox1785033448000 implements MigrationInterface {
  name = 'Outbox1785033448000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "outbox" ("id" SERIAL NOT NULL, "pattern" character varying NOT NULL, "payload" jsonb NOT NULL, "publishedAt" TIMESTAMP WITH TIME ZONE, "attempts" integer NOT NULL DEFAULT 0, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_outbox_id" PRIMARY KEY ("id"))`,
    );
    // Partial index: the relay only ever scans pending rows.
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_pending" ON "outbox" ("publishedAt") WHERE "publishedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_outbox_pending"`);
    await queryRunner.query(`DROP TABLE "outbox"`);
  }
}
