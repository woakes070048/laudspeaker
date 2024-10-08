import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from "typeorm"

export class CreateEventsTable1728261544991 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "events",
        columns: [
          {
            name: "id",
            type: "bigint",
            isPrimary: true,
          },
          {
            name: "uuid",
            type: "UUID",
          },
          {
            name: "created_at",
            type: "timestamp",
          },
          {
            name: "generated_at",
            type: "timestamp",
          },
          {
            name: "pg_sync_published_at",
            type: "timestamp",
          },
          {
            name: "pg_sync_completed_at",
            type: "timestamp",
            default: "now()",
          },
          {
            name: "correlation_key",
            type: "varchar",
          },
          {
            name: "correlation_value",
            type: "varchar",
          },
          {
            name: "event",
            type: "varchar",
          },
          {
            name: "payload",
            type: "jsonb",
          },
          {
            name: "context",
            type: "jsonb",
          },
          {
            name: "source",
            type: "varchar",
          },
          {
            name: "workspace_id",
            type: "UUID",
          },
        ],
      })
    );

    await queryRunner.createIndices(
      "events",
      [
        new TableIndex({
          name: "idx_created_at",
          columnNames: ["created_at"]
        }),
        new TableIndex({
          name: "idx_generated_at",
          columnNames: ["generated_at"]
        }),
        new TableIndex({
          name: "idx_correlation_value",
          columnNames: ["correlation_value"]
        }),
        new TableIndex({
          name: "idx_event",
          columnNames: ["event"]
        }),
        new TableIndex({
          name: "idx_payload",
          columnNames: ["payload"]
        }),
        new TableIndex({
          name: "idx_context",
          columnNames: ["context"]
        }),
        new TableIndex({
          name: "idx_workspace_id",
          columnNames: ["workspace_id"]
        }),
      ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
  }

}
