import { MigrationInterface, QueryRunner } from "typeorm"

export class CreatePlansForExistingOrgs1717180399574 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
      const existing_plan_id = '48ca36c1-b1f8-43f2-809d-9860a2862d0f';

      const organizations = await queryRunner.query(`SELECT * FROM "organization" where "planId" IS NULL OR "planId" = '${existing_plan_id}'`);

      for(const organization of organizations) {
        const planResult = await queryRunner.query(`INSERT INTO organization_plan DEFAULT VALUES RETURNING "id"`);

        const newPlanId = planResult[0].id;

        await queryRunner.query(`UPDATE organization SET "planId" = '${newPlanId}' WHERE id = '${organization.id}'`);
        console.log(`Organization ${organization.id}: new plan: ${newPlanId}`);
      }

      await queryRunner.query(`DELETE FROM organization_plan where id = '${existing_plan_id}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
    }

}
