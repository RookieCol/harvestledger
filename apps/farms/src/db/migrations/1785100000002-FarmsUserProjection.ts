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
