import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PostgresAdminAnalyticsRepository } from "../src/admin/analytics/postgres-repository";
import type { PostgresQueryClient } from "../src/render-jobs/postgres-repository";

describe("PostgresAdminAnalyticsRepository", () => {
  it("returns bounded aggregate admin analytics without raw customer data", async () => {
    const client = new FakePgClient([
      [{ total_workspaces: "3" }],
      [
        { tier: "creator", workspace_count: "2" },
        { tier: "studio", workspace_count: "1" },
      ],
      [{ upload_count: "5", total_bytes: "1200000000" }],
      [{ brief_count: "4", version_count: "9" }],
      [{ decision_list_count: "6" }],
      [
        { status: "ready", job_count: "7", estimated_minutes: "70" },
        { status: "failed", job_count: "1", estimated_minutes: "10" },
      ],
      [{ failure_code: "render_timeout", failure_count: "1" }],
      [{ render_minutes: "42" }],
      [{ output_count: "11", total_output_bytes: "456000000" }],
    ]);
    const repository = new PostgresAdminAnalyticsRepository(client);
    const start = new Date("2026-05-01T00:00:00.000Z");
    const end = new Date("2026-05-27T00:00:00.000Z");
    const generatedAt = new Date("2026-05-27T03:00:00.000Z");

    const summary = await repository.getSummary({
      workspaceId: "workspace_123",
      start,
      end,
      generatedAt,
    });

    assert.deepEqual(summary, {
      generatedAt: "2026-05-27T03:00:00.000Z",
      window: {
        start: "2026-05-01T00:00:00.000Z",
        end: "2026-05-27T00:00:00.000Z",
      },
      workspaceId: "workspace_123",
      workspaces: {
        total: 3,
        byTier: {
          creator: 2,
          free: 0,
          studio: 1,
        },
      },
      uploads: {
        count: 5,
        totalBytes: 1_200_000_000,
      },
      editBriefs: {
        briefCount: 4,
        versionCount: 9,
      },
      decisionLists: {
        count: 6,
      },
      renderJobs: {
        total: 8,
        byStatus: {
          canceled: 0,
          created: 0,
          failed: 1,
          ready: 7,
          render_queued: 0,
          rendering: 0,
          transcribed: 0,
          transcribing: 0,
          uploaded: 0,
        },
        successRate: 0.875,
        estimatedRenderMinutes: 80,
        failureCodes: [
          {
            code: "render_timeout",
            count: 1,
          },
        ],
      },
      usage: {
        renderMinutes: 42,
      },
      storage: {
        outputCount: 11,
        totalOutputBytes: 456_000_000,
      },
    });
    assert.equal(client.queries.length, 9);
    for (const query of client.queries) {
      assert.deepEqual(query.values, ["workspace_123", start, end]);
      assert.doesNotMatch(query.text, /select \*/i);
    }
    assert.doesNotMatch(JSON.stringify(summary), /source_key|storage_key|payload|secret|password/i);
    assert.match(client.queries.at(-1)?.text ?? "", /jsonb_array_elements/);
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
