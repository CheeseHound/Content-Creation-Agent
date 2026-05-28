import assert from "node:assert/strict";
import { once } from "node:events";
import type http from "node:http";
import { describe, it } from "node:test";

import { createAdminAnalyticsSummaryHandler } from "../src/admin/analytics/route";
import type {
  AdminAnalyticsRepository,
  AdminAnalyticsSummary,
} from "../src/admin/analytics/types";
import { createStaticAdminAuthorizer } from "../src/admin/auth";
import { createApiServer, createInMemoryDependencies } from "../src/server";

const SUMMARY: AdminAnalyticsSummary = {
  generatedAt: "2026-05-27T03:00:00.000Z",
  window: {
    start: "2026-05-01T00:00:00.000Z",
    end: "2026-05-27T00:00:00.000Z",
  },
  workspaceId: "workspace_123",
  workspaces: {
    total: 1,
    byTier: {
      creator: 1,
      free: 0,
      studio: 0,
    },
  },
  uploads: {
    count: 3,
    totalBytes: 900_000_000,
  },
  transcripts: {
    count: 2,
    segmentCount: 48,
  },
  editBriefs: {
    briefCount: 2,
    versionCount: 5,
  },
  decisionLists: {
    count: 4,
  },
  renderJobs: {
    total: 8,
    byStatus: {
      canceled: 0,
      created: 0,
      failed: 1,
      ready: 5,
      render_queued: 1,
      rendering: 1,
      transcribed: 0,
      transcribing: 0,
      uploaded: 0,
    },
    successRate: 0.625,
    estimatedRenderMinutes: 48,
    queueLatency: {
      measuredJobs: 6,
      averageSeconds: 18,
      p95Seconds: 44,
      maxSeconds: 52,
    },
    renderDuration: {
      measuredJobs: 5,
      averageSeconds: 96,
      p95Seconds: 181,
      maxSeconds: 214,
    },
    failureCodes: [
      {
        code: "render_timeout",
        count: 1,
      },
    ],
  },
  usage: {
    renderMinutes: 42,
    reconciliation: {
      readyRenderJobs: 5,
      ledgeredRenderJobs: 4,
      unledgeredReadyRenderJobs: 1,
      estimatedReadyRenderMinutes: 48,
      ledgeredReadyRenderMinutes: 42,
      varianceRenderMinutes: 6,
    },
  },
  storage: {
    outputCount: 11,
    totalOutputBytes: 456_000_000,
  },
};

describe("admin analytics route", () => {
  it("rejects missing admin credentials before querying analytics", async () => {
    const repository = new RecordingAdminAnalyticsRepository(SUMMARY);
    const handler = createAdminAnalyticsSummaryHandler({
      adminAnalyticsRepository: repository,
      adminAuthorizer: createStaticAdminAuthorizer("admin-token-123456"),
      now: () => new Date("2026-05-27T03:00:00.000Z"),
    });

    const response = await handler({
      headers: {},
      query: new URLSearchParams("workspaceId=workspace_123"),
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
    if (response.body.success) {
      assert.fail("Expected admin request to be rejected.");
    }
    assert.equal(response.body.error.code, "admin_auth_required");
    assert.equal(repository.requests.length, 0);
  });

  it("rejects invalid admin credentials before querying analytics", async () => {
    const repository = new RecordingAdminAnalyticsRepository(SUMMARY);
    const handler = createAdminAnalyticsSummaryHandler({
      adminAnalyticsRepository: repository,
      adminAuthorizer: createStaticAdminAuthorizer("admin-token-123456"),
      now: () => new Date("2026-05-27T03:00:00.000Z"),
    });

    const response = await handler({
      headers: {
        authorization: "Bearer wrong-token",
      },
      query: new URLSearchParams("workspaceId=workspace_123"),
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
    assert.equal(repository.requests.length, 0);
  });

  it("returns a bounded sanitized admin analytics summary", async () => {
    const repository = new RecordingAdminAnalyticsRepository(SUMMARY);
    const handler = createAdminAnalyticsSummaryHandler({
      adminAnalyticsRepository: repository,
      adminAuthorizer: createStaticAdminAuthorizer("admin-token-123456"),
      now: () => new Date("2026-05-27T03:00:00.000Z"),
    });

    const response = await handler({
      headers: {
        authorization: "Bearer admin-token-123456",
      },
      query: new URLSearchParams(
        "workspaceId=workspace_123&start=2026-05-01&end=2026-05-27",
      ),
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    if (!response.body.success) {
      assert.fail("Expected admin analytics request to succeed.");
    }
    assert.deepEqual(response.body.data, SUMMARY);
    assert.deepEqual(repository.requests, [
      {
        workspaceId: "workspace_123",
        start: new Date("2026-05-01T00:00:00.000Z"),
        end: new Date("2026-05-27T00:00:00.000Z"),
        generatedAt: new Date("2026-05-27T03:00:00.000Z"),
      },
    ]);
    assert.doesNotMatch(JSON.stringify(response.body), /postgres:\/\/|storageKey|source_key|SECRET|password/i);
  });

  it("rejects unbounded date windows", async () => {
    const repository = new RecordingAdminAnalyticsRepository(SUMMARY);
    const handler = createAdminAnalyticsSummaryHandler({
      adminAnalyticsRepository: repository,
      adminAuthorizer: createStaticAdminAuthorizer("admin-token-123456"),
      now: () => new Date("2026-05-27T03:00:00.000Z"),
    });

    const response = await handler({
      headers: {
        authorization: "Bearer admin-token-123456",
      },
      query: new URLSearchParams("start=2026-01-01&end=2026-05-27"),
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    if (response.body.success) {
      assert.fail("Expected admin analytics validation to fail.");
    }
    assert.equal(response.body.error.code, "validation_error");
    assert.equal(repository.requests.length, 0);
  });

  it("wires the protected admin summary endpoint into the API server", async () => {
    const server = createApiServer({
      ...createInMemoryDependencies(),
      adminAuthorizer: createStaticAdminAuthorizer("admin-token-123456"),
      now: () => new Date("2026-05-27T03:00:00.000Z"),
    });

    try {
      const baseUrl = await listen(server);
      const unauthorizedResponse = await fetch(
        `${baseUrl}/internal/admin/analytics/summary`,
      );
      const authorizedResponse = await fetch(
        `${baseUrl}/internal/admin/analytics/summary?workspaceId=workspace_123`,
        {
          headers: {
            authorization: "Bearer admin-token-123456",
          },
        },
      );

      assert.equal(unauthorizedResponse.status, 401);
      assert.equal(authorizedResponse.status, 200);
      const body = await authorizedResponse.json();
      assert.equal(body.success, true);
      assert.equal(body.data.workspaceId, "workspace_123");
      assert.doesNotMatch(JSON.stringify(body), /SECRET|postgres:\/\/|source_key|storageKey/i);
    } finally {
      await close(server);
    }
  });
});

class RecordingAdminAnalyticsRepository implements AdminAnalyticsRepository {
  requests: Array<{
    workspaceId?: string;
    start: Date;
    end: Date;
    generatedAt: Date;
  }> = [];

  constructor(private readonly summary: AdminAnalyticsSummary) {}

  async getSummary(request: {
    workspaceId?: string;
    start: Date;
    end: Date;
    generatedAt: Date;
  }): Promise<AdminAnalyticsSummary> {
    this.requests = [...this.requests, request];
    return this.summary;
  }
}

async function listen(server: http.Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("server did not bind to a TCP port");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function close(server: http.Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
