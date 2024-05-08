import { MigrationInterface, QueryRunner } from 'typeorm';

export class SegmentIsUpdating1713788844458 implements MigrationInterface {
  name = 'SegmentIsUpdating1713788844458';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "segment" ADD "isUpdating" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "segment" DROP COLUMN "isUpdating"`);
  }
}
