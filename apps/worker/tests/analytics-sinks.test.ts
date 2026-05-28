import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createWorkerAnalyticsSink } from "../src/analytics-sinks";

describe("worker analytics sinks", () => {
  it("sends worker lifecycle events to PostHog without storage keys", async () => {
    const fetch = new RecordingFetch();
    const sink = createWorkerAnalyticsSink({
      sink: "posthog",
      postHog: {
        apiKey: "fixture-api-key",
        host: "https://us.posthog.com",
        fetch,
      },
    });

    await sink.track({
      eventName: "render_ready",
      workspaceId: "workspace_123",
      projectId: "project_456",
      userId: "user_789",
      sourceAssetId: "asset_abc",
      renderJobId: "render_job_abc",
      occurredAt: "2026-05-28T08:00:00.000Z",
      properties: {
        workerMode: "real",
        outputCount: 2,
        totalOutputBytes: 500,
      },
    });

    assert.equal(fetch.calls.length, 1);
    assert.equal(fetch.calls[0]?.url, "https://us.posthog.com/capture/");
    const body = JSON.parse(fetch.calls[0]?.init.body ?? "{}") as {
      event: string;
      distinct_id: string;
      properties: Record<string, unknown>;
    };

    assert.equal(body.event, "render_ready");
    assert.equal(body.distinct_id, "user_789");
    assert.equal(body.properties.renderJobId, "render_job_abc");
    assert.equal(body.properties.outputCount, 2);
    assert.doesNotMatch(JSON.stringify(body), /storageKey|source_key|secret/i);
  });

  it("rejects failed PostHog captures without exposing the API key", async () => {
    const sink = createWorkerAnalyticsSink({
      sink: "posthog",
      postHog: {
        apiKey: "fixture-redacted-value",
        host: "https://us.posthog.com",
        fetch: new RecordingFetch(false),
      },
    });

    await assert.rejects(
      sink.track({
        eventName: "render_failed",
        workspaceId: "workspace_123",
        projectId: "project_456",
        userId: "user_789",
        sourceAssetId: "asset_abc",
        renderJobId: "render_job_abc",
        occurredAt: "2026-05-28T08:00:00.000Z",
        properties: {
          workerMode: "real",
          failureCode: "real_hyperframes_render_failed",
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /status 503/);
        assert.doesNotMatch(error.message, /fixture-redacted-value/);
        return true;
      },
    );
  });
});

interface FetchCall {
  url: string;
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  };
}

class RecordingFetch {
  calls: readonly FetchCall[] = [];

  constructor(private readonly ok = true) {}

  async fetch(url: string, init: FetchCall["init"]) {
    this.calls = [...this.calls, { url, init }];

    return {
      ok: this.ok,
      status: this.ok ? 200 : 503,
    };
  }
}
