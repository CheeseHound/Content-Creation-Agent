import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { BullMqRenderQueue } from "../src/queue/bullmq-render-queue";
import type { QueueJob, QueueJobPayload } from "../src/render-jobs/types";

const QUEUE_JOB: QueueJob = {
  queueName: "content-ops-render",
  idempotencyKey: "render:workspace_123:project_456:asset_abc:4:instagram_reels,tiktok,youtube_shorts:bold-captions:9b32c29f9218",
  priority: 50,
  payload: {
    schema_version: "content_ops.render_job.v1",
    workspace_id: "workspace_123",
    project_id: "project_456",
    user_id: "user_789",
    source_asset_id: "asset_abc",
    subscription_tier: "creator",
    storage: {
      source_key: "workspaces/workspace_123/projects/project_456/uploads/asset_abc/founder-demo.mov",
      audio_key: "workspaces/workspace_123/projects/project_456/audio/asset_abc/source.wav",
      transcript_key: "workspaces/workspace_123/projects/project_456/transcripts/asset_abc/transcript.json",
      render_output_prefix: "workspaces/workspace_123/projects/project_456/renders/asset_abc/",
    },
    render: {
      render_engine: "hyperframes",
      brand_name: "ClipOps",
      audience: "founder-led B2B companies",
      clip_count: 4,
      platforms: ["instagram_reels", "tiktok", "youtube_shorts"],
      estimated_minutes: 16,
      template: {
        variant: "bold-captions",
        parameters: {
          cta_text: "Book the full walkthrough",
          hook_text: "Stop wasting demo footage",
          show_progress_bar: true,
        },
      },
      style_options: {
        font_family: "Inter",
        brand_color: "#1D4ED8",
        accent_color: "#F97316",
        caption_position: "bottom",
        overlay_position: "center",
      },
      caption_timeline: [
        {
          start_ms: 0,
          end_ms: 1_800,
          text: "Stop wasting your best demo footage.",
        },
        {
          start_ms: 1_800,
          end_ms: 3_600,
          text: "Turn it into short clips with branded captions.",
        },
      ],
      source_assets: [
        {
          role: "primary_video",
          asset_id: "asset_abc",
          storage_key: "workspaces/workspace_123/projects/project_456/uploads/asset_abc/founder-demo.mov",
        },
      ],
      composition: {
        aspect_ratio: "9:16",
        width: 1080,
        height: 1920,
        fps: 30,
      },
      output_settings: {
        format: "mp4",
        video_codec: "h264",
        audio_codec: "aac",
      },
    },
  },
};

describe("BullMqRenderQueue", () => {
  it("adds the worker payload with a deterministic id, priority, and retry policy", async () => {
    const client = new FakeBullMqQueueClient("content-ops-render");
    const queue = new BullMqRenderQueue(client);

    await queue.enqueue(QUEUE_JOB);

    assert.equal(client.addedJobs.length, 1);
    assert.deepEqual(client.addedJobs[0], {
      name: "render-job",
      data: QUEUE_JOB.payload,
      options: {
        attempts: 3,
        backoff: {
          delay: 5_000,
          type: "exponential",
        },
        jobId: `render_${sha256(QUEUE_JOB.idempotencyKey)}`,
        priority: 50,
        removeOnComplete: {
          age: 86_400,
          count: 1_000,
        },
        removeOnFail: {
          age: 604_800,
          count: 5_000,
        },
      },
    });
    assert.doesNotMatch(client.addedJobs[0]?.options.jobId ?? "", /:/);
  });

  it("rejects jobs for a different queue before sending them to BullMQ", async () => {
    const client = new FakeBullMqQueueClient("content-ops-render");
    const queue = new BullMqRenderQueue(client);

    await assert.rejects(
      queue.enqueue({
        ...QUEUE_JOB,
        queueName: "other-render-queue",
      }),
      /queue name mismatch/,
    );
    assert.equal(client.addedJobs.length, 0);
  });

  it("closes the underlying queue client", async () => {
    const client = new FakeBullMqQueueClient("content-ops-render");
    const queue = new BullMqRenderQueue(client);

    await queue.close();

    assert.equal(client.closed, true);
  });

  it("reports sanitized queue readiness counts", async () => {
    const client = new FakeBullMqQueueClient("content-ops-render", {
      active: 2,
      delayed: 1,
      failed: 3,
      waiting: 5,
    });
    const queue = new BullMqRenderQueue(client);

    const report = await queue.getQueueHealth();

    assert.deepEqual(report, {
      status: "ok",
      name: "content-ops-render",
      counts: {
        active: 2,
        delayed: 1,
        failed: 3,
        waiting: 5,
      },
    });
    assert.deepEqual(client.countRequests, [["waiting", "active", "delayed", "failed"]]);
    assert.doesNotMatch(JSON.stringify(report), /redis:\/\/|password|SECRET/i);
  });
});

interface AddedBullMqJob {
  name: string;
  data: QueueJobPayload;
  options: unknown;
}

class FakeBullMqQueueClient {
  addedJobs: readonly AddedBullMqJob[] = [];
  countRequests: readonly string[][] = [];
  closed = false;

  constructor(
    readonly name: string,
    private readonly counts: Record<string, number> = {},
  ) {}

  async add(name: string, data: QueueJobPayload, options: unknown): Promise<void> {
    this.addedJobs = [...this.addedJobs, { name, data, options }];
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async getJobCounts(...types: string[]): Promise<Record<string, number>> {
    this.countRequests = [...this.countRequests, types];
    return this.counts;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
