import type { PostgresQueryClient } from "../render-jobs/postgres-repository";
import type {
  DatabaseHealthReport,
  DatabaseTableHealth,
} from "./types";

export const CORE_CONTENT_OPS_TABLES = [
  "workspaces",
  "users",
  "workspace_members",
  "subscriptions",
  "projects",
  "media_assets",
  "edit_briefs",
  "edit_brief_versions",
  "edit_decision_lists",
  "render_jobs",
  "usage_ledger",
  "webhook_events",
] as const;

interface MigrationRow {
  name: unknown;
}

interface TableAvailabilityRow {
  table_name: unknown;
}

interface TableCountRow {
  relname: unknown;
  approximate_row_count: unknown;
}

export interface PostgresObservabilityRepositoryOptions {
  coreTables?: readonly string[];
}

export class PostgresObservabilityRepository {
  private readonly coreTables: readonly string[];

  constructor(
    private readonly client: PostgresQueryClient,
    options: PostgresObservabilityRepositoryOptions = {},
  ) {
    this.coreTables = options.coreTables ?? CORE_CONTENT_OPS_TABLES;
  }

  async getDatabaseHealth(): Promise<DatabaseHealthReport> {
    await this.client.query("select 1 as ok");

    const [migrationResult, tableResult, rowCountResult] = await Promise.all([
      this.client.query<MigrationRow>(`
        select name
        from schema_migrations
        order by name
      `),
      this.client.query<TableAvailabilityRow>(
        `
          select table_name
          from information_schema.tables
          where table_schema = 'public'
            and table_name = any($1::text[])
        `,
        [[...this.coreTables]],
      ),
      this.client.query<TableCountRow>(
        `
          select
            relname,
            greatest(reltuples, 0)::bigint as approximate_row_count
          from pg_class
          where relkind = 'r'
            and relname = any($1::text[])
        `,
        [[...this.coreTables]],
      ),
    ]);
    const appliedMigrations = migrationResult.rows.map((row) =>
      requireNonEmptyString(row.name, "schema_migrations.name"),
    );
    const availableTables = new Set(tableResult.rows.map((row) =>
      requireNonEmptyString(row.table_name, "information_schema.tables.table_name"),
    ));
    const approximateRowCounts = new Map(rowCountResult.rows.map((row) => [
      requireNonEmptyString(row.relname, "pg_class.relname"),
      toNonNegativeInteger(row.approximate_row_count, "pg_class.reltuples"),
    ]));
    const tables = this.coreTables.map((tableName): DatabaseTableHealth => ({
      name: tableName,
      status: availableTables.has(tableName) ? "ok" : "missing",
      approximateRowCount: approximateRowCounts.get(tableName) ?? 0,
    }));
    const status = (
      appliedMigrations.length > 0 &&
      tables.every((table) => table.status === "ok")
    )
      ? "ok"
      : "degraded";

    return {
      status,
      connection: { status: "ok" },
      migrations: {
        status: appliedMigrations.length > 0 ? "ok" : "degraded",
        applied: appliedMigrations,
      },
      tables,
    };
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value;
}

function toNonNegativeInteger(value: unknown, field: string): number {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return numberValue;
}
