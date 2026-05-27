import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRODUCT_ANALYTICS_EVENTS,
  sanitizeAnalyticsProperties,
  trackProductAnalyticsEvent,
} from "../src/analytics/product-events";
import type { ProductAnalyticsEventPayload, ProductAnalyticsSink } from "../src/analytics/types";

describe("product analytics event contract", () => {
  it("defines the Phase 4 funnel event names", () => {
    assert.deepEqual(PRODUCT_ANALYTICS_EVENTS, [
      "upload_presigned",
      "source_uploaded",
      "edit_brief_created",
      "decision_list_created",
      "render_job_created",
      "render_started",
      "render_ready",
      "render_failed",
      "output_downloaded",
      "checkout_started",
      "subscription_updated",
    ]);
  });

  it("tracks a sanitized analytics event through a provider-agnostic sink", async () => {
    const sink = new RecordingAnalyticsSink();

    await trackProductAnalyticsEvent({
      sink,
      eventName: "render_job_created",
      workspaceId: "workspace_123",
      projectId: "project_456",
      userId: "user_789",
      renderJobId: "render_job_abc",
      occurredAt: new Date("2026-05-27T02:00:00.000Z"),
      properties: {
        tier: "creator",
        templateVariant: "bold-captions",
        estimatedMinutes: 16,
        chatMessage: "make this funny",
        transcript: "raw transcript text",
        nested: {
          storageKey: "workspaces/workspace_123/projects/project_456/uploads/asset/source.mov",
          safeLabel: "demo clip",
        },
        innocuousLabel: "sk-secret-token-123456",
        secretAccessKey: "super-secret-storage-key",
      },
    });

    assert.deepEqual(sink.events, [
      {
        eventName: "render_job_created",
        workspaceId: "workspace_123",
        projectId: "project_456",
        userId: "user_789",
        renderJobId: "render_job_abc",
        occurredAt: "2026-05-27T02:00:00.000Z",
        properties: {
          estimatedMinutes: 16,
          nested: {
            safeLabel: "demo clip",
          },
          templateVariant: "bold-captions",
          tier: "creator",
        },
      },
    ]);
    assert.doesNotMatch(
      JSON.stringify(sink.events),
      /make this funny|raw transcript|storageKey|super-secret|source\.mov/i,
    );
  });

  it("rejects unknown product analytics events before sending", async () => {
    const sink = new RecordingAnalyticsSink();

    await assert.rejects(
      trackProductAnalyticsEvent({
        sink,
        eventName: "raw_prompt_logged",
        workspaceId: "workspace_123",
        occurredAt: new Date("2026-05-27T02:00:00.000Z"),
        properties: {},
      }),
      /unsupported product analytics event/,
    );
    assert.deepEqual(sink.events, []);
  });

  it("bounds analytics metadata values to primitives, arrays, and plain objects", () => {
    assert.deepEqual(
      sanitizeAnalyticsProperties({
        ok: true,
        count: 2,
        labels: ["render", "ready"],
        date: new Date("2026-05-27T02:00:00.000Z"),
        empty: undefined,
        list: [
          {
            safe: "value",
            password: "nope",
          },
        ],
      }),
      {
        count: 2,
        labels: ["render", "ready"],
        list: [
          {
            safe: "value",
          },
        ],
        ok: true,
      },
    );
  });
});

class RecordingAnalyticsSink implements ProductAnalyticsSink {
  events: readonly ProductAnalyticsEventPayload[] = [];

  async track(event: ProductAnalyticsEventPayload): Promise<void> {
    this.events = [...this.events, event];
  }
}
