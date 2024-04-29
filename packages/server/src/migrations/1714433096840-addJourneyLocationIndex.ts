import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJourneyLocationIndex1714433096840 implements MigrationInterface {
    name = 'AddJourneyLocationIndex1714433096840'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_journey_location" ON "journey_location" ("journeyId", "customer", "workspaceId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_journey_location"`);
    }

}
