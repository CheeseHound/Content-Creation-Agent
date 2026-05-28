import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PostgresRenderWorkerRepository } from "../src/postgres-render-worker-repository";
import type { QueueJobPayload } from "../src/payload";

describe("PostgresRenderWorkerRepository", () => {
  it("claims queued jobs by queue payload and marks them rendering", async () => {
    const client = new FakePgClient([
      [{ id: "render_job_fixture", status: "rendering" }],
    ]);
    const repository = new PostgresRenderWorkerRepository(client);

    const claim = await repository.markRendering(QUEUE_PAYLOAD, {
      workspaceManifestPath: "/tmp/render-workspace-manifest.json",
    });

    assert.deepEqual(claim, { renderJobId: "render_job_fixture" });
    assert.match(client.queries[0]?.text ?? "", /update render_jobs/i);
    assert.match(client.queries[0]?.text ?? "", /status = 'rendering'/i);
    assert.match(client.queries[0]?.text ?? "", /render_started_at = coalesce\(render_started_at, now\(\)\)/i);
    assert.equal(client.queries[0]?.values[0], QUEUE_PAYLOAD.workspace_id);
    assert.equal(client.queries[0]?.values[3], JSON.stringify(QUEUE_PAYLOAD));
  });

  it("treats already-ready jobs as idempotent retry skips", async () => {
    const client = new FakePgClient([
      [],
      [{ id: "render_job_fixture", status: "ready" }],
    ]);
    const repository = new PostgresRenderWorkerRepository(client);

    const claim = await repository.markRendering(QUEUE_PAYLOAD, {
      workspaceManifestPath: "/tmp/render-workspace-manifest.json",
    });

    assert.deepEqual(claim, { renderJobId: "render_job_fixture", alreadyReady: true });
    assert.match(client.queries[1]?.text ?? "", /select/i);
  });

  it("persists ready output manifests without embedding storage credentials", async () => {
    const client = new FakePgClient([
      [{ id: "render_job_fixture", status: "ready" }],
    ]);
    const repository = new PostgresRenderWorkerRepository(client);

    await repository.markReady({ renderJobId: "render_job_fixture" }, {
      outputs: [],
    });

    assert.match(client.queries[0]?.text ?? "", /output_manifest/i);
    assert.match(client.queries[0]?.text ?? "", /render_completed_at = coalesce\(render_completed_at, now\(\)\)/i);
    assert.equal(client.queries[0]?.values[0], "render_job_fixture");
    assert.equal(client.queries[0]?.values[1], JSON.stringify({ outputs: [] }));
    assert.doesNotMatch(JSON.stringify(client.queries[0]?.values), /SECRET|TOKEN|PASSWORD/i);
  });

  it("stores sanitized failure messages for queued or rendering jobs", async () => {
    const client = new FakePgClient([
      [{ id: "render_job_fixture", status: "failed" }],
    ]);
    const repository = new PostgresRenderWorkerRepository(client);

    await repository.markFailed(QUEUE_PAYLOAD, {
      code: "mock_hyperframes_render_failed",
      message: "render workspace validation failed",
    });

    assert.match(client.queries[0]?.text ?? "", /failure_message/i);
    assert.match(client.queries[0]?.text ?? "", /render_failed_at = coalesce\(render_failed_at, now\(\)\)/i);
    assert.equal(client.queries[0]?.values[3], JSON.stringify(QUEUE_PAYLOAD));
    assert.equal(client.queries[0]?.values[4], "mock_hyperframes_render_failed");
    assert.equal(client.queries[0]?.values[5], "render workspace validation failed");
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

interface QueryCall {
  text: string;
  values: readonly unknown[];
}

class FakePgClient {
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
