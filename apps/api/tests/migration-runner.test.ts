import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { runMigrations } from "../src/db/migrations";
import type { PostgresQueryClient } from "../src/render-jobs/postgres-repository";

describe("runMigrations", () => {
  it("applies pending SQL migrations in filename order and records checksums", async () => {
    const client = new FakePgClient({
      appliedMigrations: ["001_initial_content_ops.sql"],
    });

    const result = await runMigrations({
      client,
      migrations: [
        { name: "002_add_uploads.sql", sql: "create table uploads(id text primary key);" },
        { name: "001_initial_content_ops.sql", sql: "create table workspaces(id text primary key);" },
      ],
    });

    assert.deepEqual(result, {
      applied: ["002_add_uploads.sql"],
      skipped: ["001_initial_content_ops.sql"],
    });
    assert.deepEqual(
      client.queries.map((query) => normalizeSql(query.text)),
      [
        "create table if not exists schema_migrations",
        "select name, checksum from schema_migrations",
        "begin",
        "create table uploads(id text primary key);",
        "insert into schema_migrations",
        "commit",
      ],
    );
    assert.equal(client.queries[4]?.values[0], "002_add_uploads.sql");
    assert.equal(typeof client.queries[4]?.values[1], "string");
    assert.match(String(client.queries[4]?.values[1]), /^[a-f0-9]{64}$/);
  });

  it("rolls back the active migration when applying SQL fails", async () => {
    const client = new FakePgClient({
      throwOnSql: "create table uploads",
    });

    await assert.rejects(
      runMigrations({
        client,
        migrations: [
          { name: "001_initial_content_ops.sql", sql: "create table uploads(id text primary key);" },
        ],
      }),
      /failed to apply migration 001_initial_content_ops\.sql/,
    );

    assert.deepEqual(
      client.queries.map((query) => normalizeSql(query.text)),
      [
        "create table if not exists schema_migrations",
        "select name, checksum from schema_migrations",
        "begin",
        "create table uploads(id text primary key);",
        "rollback",
      ],
    );
  });

  it("rejects applied migrations whose SQL checksum changed", async () => {
    const client = new FakePgClient({
      appliedMigrations: [
        {
          name: "001_initial_content_ops.sql",
          checksum: checksumSql("create table old_workspaces(id text primary key);"),
        },
      ],
    });

    await assert.rejects(
      runMigrations({
        client,
        migrations: [
          {
            name: "001_initial_content_ops.sql",
            sql: "create table workspaces(id text primary key);",
          },
        ],
      }),
      /migration 001_initial_content_ops\.sql checksum does not match/,
    );
  });
});

interface QueryCall {
  text: string;
  values: readonly unknown[];
}

class FakePgClient implements PostgresQueryClient {
  queries: readonly QueryCall[] = [];
  private readonly appliedMigrations: readonly AppliedMigrationRow[];
  private readonly throwOnSql?: string;

  constructor({
    appliedMigrations = [],
    throwOnSql,
  }: {
    appliedMigrations?: readonly AppliedMigrationInput[];
    throwOnSql?: string;
  } = {}) {
    this.appliedMigrations = appliedMigrations.map((migration) => {
      if (typeof migration === "string") {
        return {
          name: migration,
          checksum: checksumSql("create table workspaces(id text primary key);"),
        };
      }

      return migration;
    });
    this.throwOnSql = throwOnSql;
  }

  async query<T>(text: string, values: readonly unknown[] = []): Promise<{ rows: T[] }> {
    this.queries = [...this.queries, { text, values }];

    if (this.throwOnSql && text.includes(this.throwOnSql)) {
      throw new Error("migration sql failed");
    }

    if (normalizeSql(text) === "select name, checksum from schema_migrations") {
      return {
        rows: this.appliedMigrations as T[],
      };
    }

    return { rows: [] };
  }
}

type AppliedMigrationInput =
  | string
  | {
    name: string;
    checksum: string;
  };

interface AppliedMigrationRow {
  name: string;
  checksum: string;
}

function normalizeSql(sql: string): string {
  const normalized = sql.trim().replace(/\s+/g, " ");

  if (/^create table if not exists schema_migrations/i.test(normalized)) {
    return "create table if not exists schema_migrations";
  }

  if (/^insert into schema_migrations/i.test(normalized)) {
    return "insert into schema_migrations";
  }

  if (/^select name, checksum from schema_migrations/i.test(normalized)) {
    return "select name, checksum from schema_migrations";
  }

  return normalized.toLowerCase();
}

function checksumSql(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}
