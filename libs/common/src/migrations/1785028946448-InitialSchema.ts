import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1785028946448 implements MigrationInterface {
  name = 'InitialSchema1785028946448';

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
    await queryRunner.query(
      `ALTER TABLE "farms" ADD CONSTRAINT "FK_39f1ebfd7501e560552cff6760a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
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
    await queryRunner.query(
      `ALTER TABLE "farms" DROP CONSTRAINT "FK_39f1ebfd7501e560552cff6760a"`,
    );
    await queryRunner.query(`DROP TABLE "activities"`);
    await queryRunner.query(`DROP TABLE "crops"`);
    await queryRunner.query(`DROP TABLE "harvests"`);
    await queryRunner.query(`DROP TABLE "farms"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_documenttype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_gender_enum"`);
  }
}
