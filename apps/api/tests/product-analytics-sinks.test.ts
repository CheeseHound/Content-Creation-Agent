import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPostHogProductAnalyticsSink,
  createProductAnalyticsSink,
  type ProductAnalyticsFetch,
} from "../src/analytics/sinks";

describe("product analytics sinks", () => {
  it("creates a no-op sink when product analytics are disabled", async () => {
    const sink = createProductAnalyticsSink({ sink: "none" });

    await sink.track({
      eventName: "upload_presigned",
      workspaceId: "workspace_123",
      occurredAt: "2026-05-22T12:00:00.000Z",
      properties: {},
    });
  });

  it("sends sanitized events to PostHog capture without customer media metadata", async () => {
    const fetch = new RecordingFetch({ ok: true, status: 200 });
    const sink = createPostHogProductAnalyticsSink({
      apiKey: "phc_test_key",
      host: "https://eu.posthog.com",
      fetch,
    });

    await sink.track({
      eventName: "render_job_created",
      workspaceId: "workspace_123",
      projectId: "project_456",
      userId: "user_789",
      sourceAssetId: "asset_abc",
      renderJobId: "render_job_123",
      occurredAt: "2026-05-22T12:00:00.000Z",
      properties: {
        estimatedRenderMinutes: 16,
        storageKey: "workspaces/workspace_123/uploads/asset_abc/source.mov",
        transcript: "raw transcript",
        tier: "creator",
      } as never,
    });

    assert.equal(fetch.requests.length, 1);
    assert.equal(fetch.requests[0]?.url, "https://eu.posthog.com/capture/");
    assert.deepEqual(fetch.requests[0]?.init.headers, {
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(fetch.requests[0]?.init.body ?? "{}"), {
      api_key: "phc_test_key",
      distinct_id: "user_789",
      event: "render_job_created",
      timestamp: "2026-05-22T12:00:00.000Z",
      properties: {
        estimatedRenderMinutes: 16,
        projectId: "project_456",
        renderJobId: "render_job_123",
        sourceAssetId: "asset_abc",
        tier: "creator",
        userId: "user_789",
        workspaceId: "workspace_123",
      },
    });
    assert.doesNotMatch(
      fetch.requests[0]?.init.body ?? "",
      /storageKey|source\.mov|raw transcript|workspaces\/workspace_123/i,
    );
  });

  it("uses workspace id as the PostHog distinct id when user id is absent", async () => {
    const fetch = new RecordingFetch({ ok: true, status: 200 });
    const sink = createPostHogProductAnalyticsSink({
      apiKey: "phc_test_key",
      host: "https://app.posthog.com",
      fetch,
    });

    await sink.track({
      eventName: "checkout_started",
      workspaceId: "workspace_123",
      occurredAt: "2026-05-22T12:00:00.000Z",
      properties: {},
    });

    assert.equal(JSON.parse(fetch.requests[0]?.init.body ?? "{}").distinct_id, "workspace_123");
  });

  it("rejects failed PostHog captures without exposing the API key", async () => {
    const sink = createPostHogProductAnalyticsSink({
      apiKey: "phc_super_secret_key",
      host: "https://eu.posthog.com",
      fetch: new RecordingFetch({ ok: false, status: 503 }),
    });

    await assert.rejects(
      sink.track({
        eventName: "render_failed",
        workspaceId: "workspace_123",
        occurredAt: "2026-05-22T12:00:00.000Z",
        properties: {},
      }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /PostHog capture failed with status 503/);
        assert.doesNotMatch(error.message, /phc_super_secret_key/);
        return true;
      },
    );
  });
});

interface RecordedFetchRequest {
  url: string;
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
}

class RecordingFetch implements ProductAnalyticsFetch {
  requests: readonly RecordedFetchRequest[] = [];

  constructor(private readonly response: { ok: boolean; status: number }) {}

  async fetch(url: string, init: RecordedFetchRequest["init"]) {
    this.requests = [...this.requests, { url, init }];
    return this.response;
  }
}
