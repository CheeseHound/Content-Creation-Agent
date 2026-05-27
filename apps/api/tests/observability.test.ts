import assert from "node:assert/strict";
import { once } from "node:events";
import type http from "node:http";
import { describe, it } from "node:test";

import { createApiServer, createInMemoryDependencies } from "../src/server";
import { createHealthzHandler, createReadyzHandler } from "../src/observability/route";
import type {
  DatabaseHealthReport,
  QueueHealthReport,
  StorageHealthReport,
} from "../src/observability/types";

describe("observability health routes", () => {
  it("returns a dependency-free liveness response", () => {
    const response = createHealthzHandler({
      now: () => new Date("2026-05-27T01:00:00.000Z"),
    })();

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      success: true,
      data: {
        status: "ok",
        generatedAt: "2026-05-27T01:00:00.000Z",
      },
    });
  });

  it("returns sanitized readiness when all dependencies are available", async () => {
    const response = await createReadyzHandler({
      databaseHealthRepository: new FakeDatabaseHealthRepository({
        status: "ok",
        connection: { status: "ok" },
        migrations: {
          status: "ok",
          applied: ["001_initial_content_ops.sql"],
        },
        tables: [
          {
            name: "render_jobs",
            status: "ok",
            approximateRowCount: 12,
          },
        ],
      }),
      queueHealthCheck: new FakeQueueHealthCheck({
        status: "ok",
        name: "content-ops-render",
        counts: {
          active: 1,
          delayed: 0,
          failed: 0,
          waiting: 3,
        },
      }),
      storageHealthCheck: new FakeStorageHealthCheck({
        status: "ok",
        provider: "s3_compatible",
        configured: true,
      }),
      now: () => new Date("2026-05-27T01:00:00.000Z"),
    })();

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    if (!response.body.success) {
      assert.fail("Expected readiness to succeed.");
    }
    assert.equal(response.body.data.status, "ok");
    assert.equal(response.body.data.checks.database.status, "ok");
    assert.equal(response.body.data.checks.queue.status, "ok");
    assert.equal(response.body.data.checks.storage.status, "ok");
    assert.doesNotMatch(JSON.stringify(response.body), /postgres:\/\/|redis:\/\/|SECRET|ACCESS_KEY|password/i);
  });

  it("returns 503 with sanitized dependency errors when readiness checks fail", async () => {
    const response = await createReadyzHandler({
      databaseHealthRepository: {
        async getDatabaseHealth() {
          throw new Error("postgres://user:super-secret-password@localhost:5432/content_ops");
        },
      },
      queueHealthCheck: new FakeQueueHealthCheck({
        status: "ok",
        name: "content-ops-render",
        counts: {
          active: 0,
          delayed: 0,
          failed: 0,
          waiting: 0,
        },
      }),
      storageHealthCheck: new FakeStorageHealthCheck({
        status: "ok",
        provider: "s3_compatible",
        configured: true,
      }),
      now: () => new Date("2026-05-27T01:00:00.000Z"),
    })();

    assert.equal(response.status, 503);
    assert.equal(response.body.success, true);
    if (!response.body.success) {
      assert.fail("Expected readiness response envelope to succeed.");
    }
    assert.equal(response.body.data.status, "degraded");
    assert.deepEqual(response.body.data.checks.database, {
      status: "degraded",
      connection: {
        status: "unavailable",
        errorCode: "database_unavailable",
      },
      migrations: {
        status: "unavailable",
        applied: [],
      },
      tables: [],
    });
    assert.doesNotMatch(JSON.stringify(response.body), /super-secret-password|postgres:\/\//);
  });

  it("wires /healthz and /readyz into the API server", async () => {
    const server = createApiServer({
      ...createInMemoryDependencies(),
      now: () => new Date("2026-05-27T01:00:00.000Z"),
    });

    try {
      const baseUrl = await listen(server);
      const healthResponse = await fetch(`${baseUrl}/healthz`);
      const readyResponse = await fetch(`${baseUrl}/readyz`);

      assert.equal(healthResponse.status, 200);
      assert.equal(readyResponse.status, 200);
      assert.deepEqual(await healthResponse.json(), {
        success: true,
        data: {
          status: "ok",
          generatedAt: "2026-05-27T01:00:00.000Z",
        },
      });
      assert.doesNotMatch(JSON.stringify(await readyResponse.json()), /SECRET|ACCESS_KEY|postgres:\/\//i);
    } finally {
      await close(server);
    }
  });
});

class FakeDatabaseHealthRepository {
  constructor(private readonly report: DatabaseHealthReport) {}

  async getDatabaseHealth(): Promise<DatabaseHealthReport> {
    return this.report;
  }
}

class FakeQueueHealthCheck {
  constructor(private readonly report: QueueHealthReport) {}

  async getQueueHealth(): Promise<QueueHealthReport> {
    return this.report;
  }
}

class FakeStorageHealthCheck {
  constructor(private readonly report: StorageHealthReport) {}

  async getStorageHealth(): Promise<StorageHealthReport> {
    return this.report;
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
