import { MigrationInterface, QueryRunner } from "typeorm"

export class AddDateTimeFieldsToJourneyLocation1716084846092 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
          `ALTER TABLE "journey_location" ADD "journeyEntryAt" timestamp`
        );

        await queryRunner.query(
          `ALTER TABLE "journey_location" ADD "stepEntryAt" timestamp`
        );

        await queryRunner.query(
          `UPDATE "journey_location" SET "journeyEntryAt" = to_timestamp("journeyEntry");`
        );

        await queryRunner.query(
          `UPDATE "journey_location" SET "stepEntryAt" = to_timestamp("stepEntry");`
        );
        
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(        
            `ALTER TABLE "journey_location" DROP COLUMN "journeyEntryAt"`
        );

        await queryRunner.query(        
            `ALTER TABLE "journey_location" DROP COLUMN "stepEntryAt"`
        );
    }
}
