import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSegmentEntry1716077137699 implements MigrationInterface {
    name = 'AddSegmentEntry1716077137699'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_journey_location"`);
        await queryRunner.query(`ALTER TABLE "segment_customers" ADD "segmentEntry" bigint DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "segment_customers" DROP COLUMN "segmentEntry"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_journey_location" ON "journey_location" ("journeyId", "customer", "workspaceId") `);
    }

}
