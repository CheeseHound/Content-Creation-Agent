import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { PostgresQueryClient } from "../render-jobs/postgres-repository";

export interface SqlMigration {
  name: string;
  sql: string;
}

export interface MigrationRunResult {
  applied: readonly string[];
  skipped: readonly string[];
}

export interface RunMigrationsOptions {
  client: PostgresQueryClient;
  migrations?: readonly SqlMigration[];
  migrationsDirectory?: string;
}

interface AppliedMigrationRow {
  name: unknown;
  checksum: unknown;
}

const DEFAULT_MIGRATIONS_DIRECTORY = join(
  process.cwd(),
  "apps",
  "api",
  "db",
  "migrations",
);

export function loadMigrations(
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY,
): readonly SqlMigration[] {
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => ({
      name: entry.name,
      sql: readFileSync(join(migrationsDirectory, entry.name), "utf8"),
    }))
    .sort(compareMigrationsByName);
}

export async function runMigrations({
  client,
  migrations,
  migrationsDirectory,
}: RunMigrationsOptions): Promise<MigrationRunResult> {
  const orderedMigrations = [...(migrations ?? loadMigrations(migrationsDirectory))]
    .sort(compareMigrationsByName);

  await ensureMigrationTable(client);

  const appliedMigrations = await getAppliedMigrations(client);
  let applied: readonly string[] = [];
  let skipped: readonly string[] = [];

  for (const migration of orderedMigrations) {
    const appliedChecksum = appliedMigrations.get(migration.name);

    if (appliedChecksum) {
      if (appliedChecksum !== checksumSql(migration.sql)) {
        throw new Error(`migration ${migration.name} checksum does not match applied migration`);
      }

      skipped = [...skipped, migration.name];
      continue;
    }

    await applyMigration(client, migration);
    applied = [...applied, migration.name];
  }

  return { applied, skipped };
}

async function ensureMigrationTable(client: PostgresQueryClient): Promise<void> {
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function getAppliedMigrations(
  client: PostgresQueryClient,
): Promise<ReadonlyMap<string, string>> {
  const result = await client.query<AppliedMigrationRow>(`
    select name, checksum
    from schema_migrations
    order by name
  `);

  return new Map(result.rows.map((row) => [
    requireMigrationName(row.name),
    requireMigrationChecksum(row.checksum),
  ]));
}

async function applyMigration(
  client: PostgresQueryClient,
  migration: SqlMigration,
): Promise<void> {
  await client.query("begin");

  try {
    await client.query(migration.sql);
    await client.query(
      `
        insert into schema_migrations (name, checksum)
        values ($1, $2)
      `,
      [migration.name, checksumSql(migration.sql)],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw new Error(`failed to apply migration ${migration.name}`, { cause: error });
  }
}

function compareMigrationsByName(left: SqlMigration, right: SqlMigration): number {
  return left.name.localeCompare(right.name);
}

function checksumSql(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function requireMigrationName(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("schema_migrations.name must be a non-empty string");
  }

  return value;
}

function requireMigrationChecksum(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("schema_migrations.checksum must be a sha256 hex string");
  }

  return value;
}
