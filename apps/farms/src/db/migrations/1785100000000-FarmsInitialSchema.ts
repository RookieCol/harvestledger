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
