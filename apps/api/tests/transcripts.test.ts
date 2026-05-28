import assert from "node:assert/strict";
import { once } from "node:events";
import type http from "node:http";
import { describe, it } from "node:test";

import { createStaticAdminAuthorizer } from "../src/admin/auth";
import type {
  ProductAnalyticsEventPayload,
  ProductAnalyticsSink,
} from "../src/analytics/types";
import { createApiServer, createInMemoryDependencies } from "../src/server";
import { createPersistTranscriptHandler } from "../src/transcripts/route";
import type {
  PersistTranscriptBody,
  TranscriptRecord,
  TranscriptRepository,
} from "../src/transcripts/types";

describe("POST /api/transcripts", () => {
  it("persists transcript segments idempotently and emits sanitized analytics", async () => {
    const repository = new RecordingTranscriptRepository();
    const analyticsSink = new RecordingAnalyticsSink();
    const handler = createPersistTranscriptHandler({
      transcriptRepository: repository,
      analyticsSink,
      now: () => new Date("2026-05-28T06:00:00.000Z"),
    });
    const body: PersistTranscriptBody = {
      workspaceId: "workspace_123",
      projectId: "project_456",
      userId: "user_789",
      sourceAssetId: "asset_abc",
      language: "en",
      durationMs: 45_000,
      segments: [{
        startMs: 0,
        endMs: 20_000,
        text: "  Here is the dashboard reveal and workflow result. ",
      }],
    };

    const response = await handler({ body });
    const repeat = await handler({ body });

    assert.equal(response.status, 201);
    assert.equal(repeat.status, 201);
    assert.equal(response.body.success, true);
    if (!response.body.success) {
      assert.fail("Expected transcript persistence to succeed.");
    }
    assert.equal(response.body.data.transcript.schemaVersion, "content_ops.transcript.v1");
    assert.equal(response.body.data.transcript.segments[0]?.text, "Here is the dashboard reveal and workflow result.");
    assert.equal(repository.records.length, 1);
    assert.deepEqual(analyticsSink.events.map((event) => event.eventName), [
      "source_transcribed",
      "source_transcribed",
    ]);
    assert.deepEqual(analyticsSink.events[0]?.properties, {
      durationMs: 45000,
      language: "en",
      segmentCount: 1,
    });
    assert.doesNotMatch(JSON.stringify(analyticsSink.events), /dashboard reveal|workflow result|transcript/i);
  });

  it("rejects unsafe transcript text before persistence", async () => {
    const repository = new RecordingTranscriptRepository();
    const handler = createPersistTranscriptHandler({ transcriptRepository: repository });

    const response = await handler({
      body: {
        workspaceId: "workspace_123",
        projectId: "project_456",
        userId: "user_789",
        sourceAssetId: "asset_abc",
        segments: [{
          startMs: 0,
          endMs: 20_000,
          text: "my api key is sk-secret-value",
        }],
      },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.equal(repository.records.length, 0);
  });

  it("wires the transcript endpoint into the API server", async () => {
    const server = createApiServer({
      ...createInMemoryDependencies(),
      adminAuthorizer: createStaticAdminAuthorizer("admin-token-123456"),
    });

    try {
      const baseUrl = await listen(server);
      const response = await fetch(`${baseUrl}/api/transcripts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: "workspace_123",
          projectId: "project_456",
          userId: "user_789",
          sourceAssetId: "asset_abc",
          segments: [{
            startMs: 0,
            endMs: 20_000,
            text: "A dashboard reveal with a workflow result.",
          }],
        }),
      });
      const body = await response.json();

      assert.equal(response.status, 201);
      assert.equal(body.success, true);
      assert.equal(body.data.transcript.schemaVersion, "content_ops.transcript.v1");
    } finally {
      await close(server);
    }
  });
});

class RecordingTranscriptRepository implements TranscriptRepository {
  records: readonly TranscriptRecord[] = [];

  async createTranscript(record: TranscriptRecord): Promise<TranscriptRecord> {
    const existing = this.records.find((entry) => entry.idempotencyKey === record.idempotencyKey);

    if (existing) {
      return existing;
    }

    this.records = [...this.records, record];
    return record;
  }

  async getLatestTranscript(): Promise<TranscriptRecord | undefined> {
    return this.records.at(-1);
  }
}

class RecordingAnalyticsSink implements ProductAnalyticsSink {
  events: readonly ProductAnalyticsEventPayload[] = [];

  async track(event: ProductAnalyticsEventPayload): Promise<void> {
    this.events = [...this.events, event];
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
