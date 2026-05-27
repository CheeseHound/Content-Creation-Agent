import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PostgresObservabilityRepository } from "../src/observability/postgres-repository";
import type { PostgresQueryClient } from "../src/render-jobs/postgres-repository";

describe("PostgresObservabilityRepository", () => {
  it("reports sanitized connection, migration, table, and row-count health", async () => {
    const client = new FakePgClient([
      [{ ok: 1 }],
      [
        {
          name: "001_initial_content_ops.sql",
          checksum: "a".repeat(64),
        },
      ],
      [
        { table_name: "workspaces" },
        { table_name: "render_jobs" },
      ],
      [
        { relname: "workspaces", approximate_row_count: "2" },
        { relname: "render_jobs", approximate_row_count: "7" },
      ],
    ]);
    const repository = new PostgresObservabilityRepository(client, {
      coreTables: ["workspaces", "render_jobs"],
    });

    const report = await repository.getDatabaseHealth();

    assert.deepEqual(report, {
      status: "ok",
      connection: { status: "ok" },
      migrations: {
        status: "ok",
        applied: ["001_initial_content_ops.sql"],
      },
      tables: [
        {
          name: "workspaces",
          status: "ok",
          approximateRowCount: 2,
        },
        {
          name: "render_jobs",
          status: "ok",
          approximateRowCount: 7,
        },
      ],
    });
    assert.equal(client.queries.length, 4);
    assert.match(client.queries[2]?.text ?? "", /information_schema\.tables/i);
    assert.match(client.queries[3]?.text ?? "", /pg_class/i);
    assert.doesNotMatch(JSON.stringify(report), /checksum|secret|password/i);
  });

  it("marks missing core tables as degraded without throwing", async () => {
    const client = new FakePgClient([
      [{ ok: 1 }],
      [],
      [{ table_name: "workspaces" }],
      [{ relname: "workspaces", approximate_row_count: "2" }],
    ]);
    const repository = new PostgresObservabilityRepository(client, {
      coreTables: ["workspaces", "render_jobs"],
    });

    const report = await repository.getDatabaseHealth();

    assert.equal(report.status, "degraded");
    assert.deepEqual(report.migrations, {
      status: "degraded",
      applied: [],
    });
    assert.deepEqual(report.tables, [
      {
        name: "workspaces",
        status: "ok",
        approximateRowCount: 2,
      },
      {
        name: "render_jobs",
        status: "missing",
        approximateRowCount: 0,
      },
    ]);
  });
});

interface QueryCall {
  text: string;
  values: readonly unknown[];
}

class FakePgClient implements PostgresQueryClient {
  queries: readonly QueryCall[] = [];
  private responses: readonly (readonly Record<string, unknown>[])[];

  constructor(responses: readonly (readonly Record<string, unknown>[])[]) {
    this.responses = responses;
  }

  async query<T>(text: string, values: readonly unknown[] = []): Promise<{ rows: T[] }> {
    const [rows = [], ...remainingResponses] = this.responses;
    this.responses = remainingResponses;
    this.queries = [...this.queries, { text, values }];

    return {
      rows: [...rows] as T[],
    };
  }
}
