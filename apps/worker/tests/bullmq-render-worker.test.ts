import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createBullMqRenderWorkerProcessor,
  RENDER_JOB_QUEUE_NAME,
  RENDER_JOB_QUEUE_TASK,
} from "../src/bullmq-render-worker";
import type { QueueJobPayload } from "../src/payload";

describe("BullMQ render worker boundary", () => {
  it("processes content-ops-render render-job tasks with the Hyperframes payload", async () => {
    let seenPayloads: readonly QueueJobPayload[] = [];
    const processor = createBullMqRenderWorkerProcessor(async (payload) => {
      seenPayloads = [...seenPayloads, payload];
      return { status: "ready", renderJobId: "render_job_fixture", workspaceManifestPath: "/tmp/manifest.json" };
    });

    const result = await processor({
      name: RENDER_JOB_QUEUE_TASK,
      data: QUEUE_PAYLOAD,
    });

    assert.equal(RENDER_JOB_QUEUE_NAME, "content-ops-render");
    assert.equal(result.status, "ready");
    assert.deepEqual(seenPayloads, [QUEUE_PAYLOAD]);
  });

  it("rejects unexpected BullMQ task names before invoking the renderer", async () => {
    let called = false;
    const processor = createBullMqRenderWorkerProcessor(async () => {
      called = true;
      return { status: "ready", renderJobId: "render_job_fixture", workspaceManifestPath: "/tmp/manifest.json" };
    });

    await assert.rejects(
      processor({
        name: "other-task",
        data: QUEUE_PAYLOAD,
      }),
      /unexpected render worker task/,
    );
    assert.equal(called, false);
  });
});

const QUEUE_PAYLOAD: QueueJobPayload = {
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
    audience: "founders",
    clip_count: 4,
    platforms: ["instagram_reels", "tiktok"],
    estimated_minutes: 16,
    template: {
      variant: "bold-captions",
      parameters: {
        hook_text: "Stop wasting demo footage",
      },
    },
    style_options: {
      font_family: "Inter",
      brand_color: "#1D4ED8",
      caption_position: "bottom",
      overlay_position: "center",
    },
    caption_timeline: [
      {
        start_ms: 0,
        end_ms: 1_800,
        text: "Stop wasting your best demo footage.",
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
};
