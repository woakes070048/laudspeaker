import { MigrationInterface, QueryRunner } from 'typeorm';

export class JourneyEnrollingState1712986812460 implements MigrationInterface {
  name = 'JourneyEnrollingState1712986812460';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "journey" ADD "isEnrolling" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "journey" DROP COLUMN "isEnrolling"`);
  }
}
