import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

import {
  processMockHyperframesRenderJob,
  type RenderWorkerClaim,
  type RenderWorkerRepository,
} from "../src/mock-hyperframes-worker";
import type { QueueJobPayload, RenderOutputManifest } from "../src/payload";

describe("mock Hyperframes render worker", () => {
  it("stages source asset references and writes a scoped render workspace manifest", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "content-ops-worker-"));
    const repository = new InMemoryWorkerRepository();

    try {
      const result = await processMockHyperframesRenderJob(QUEUE_PAYLOAD, {
        repository,
        workspaceRoot,
        runtime: RUNTIME_BOUNDARY,
      });

      assert.equal(result.status, "ready");
      assert.ok(result.workspaceManifestPath);
      assertPathInside(workspaceRoot, result.workspaceManifestPath);
      assert.deepEqual(repository.transitions, ["rendering", "ready"]);

      const manifest = JSON.parse(await readFile(result.workspaceManifestPath, "utf8")) as {
        renderEngine: string;
        workerMode: string;
        runtime: Record<string, string>;
        sourceAssets: Array<{ storageKey: string; localReferencePath: string }>;
      };

      assert.equal(manifest.renderEngine, "hyperframes");
      assert.equal(manifest.workerMode, "mock");
      assert.equal(manifest.runtime.hyperframesCommand, "npx hyperframes");
      assert.equal(manifest.sourceAssets.length, 1);
      assert.equal(manifest.sourceAssets[0]?.storageKey, QUEUE_PAYLOAD.storage.source_key);
      assertPathInside(workspaceRoot, manifest.sourceAssets[0]?.localReferencePath ?? "");
      assert.equal(repository.readyManifest?.outputs.length, 0);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("rejects path traversal identifiers before writing outside the worker root", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "content-ops-worker-"));
    const repository = new InMemoryWorkerRepository();
    const payload = {
      ...QUEUE_PAYLOAD,
      workspace_id: "../workspace_123",
    };

    try {
      const result = await processMockHyperframesRenderJob(payload, {
        repository,
        workspaceRoot,
        runtime: RUNTIME_BOUNDARY,
      });

      assert.equal(result.status, "failure");
      assert.match(result.errorMessage ?? "", /workspace validation failed/);
      assert.deepEqual(repository.transitions, ["failed"]);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("does not leak secret-like payload fields into manifests or failure messages", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "content-ops-worker-"));
    const repository = new InMemoryWorkerRepository();
    const payload = {
      ...QUEUE_PAYLOAD,
      render: {
        ...QUEUE_PAYLOAD.render,
        template: {
          ...QUEUE_PAYLOAD.render.template,
          parameters: {
            ...QUEUE_PAYLOAD.render.template.parameters,
            access_token: "fixture-redacted-value",
          },
        },
      },
    };

    try {
      const result = await processMockHyperframesRenderJob(payload, {
        repository,
        workspaceRoot,
        runtime: RUNTIME_BOUNDARY,
      });

      assert.equal(result.status, "failure");
      assert.match(result.errorMessage ?? "", /workspace validation failed/);
      assert.doesNotMatch(result.errorMessage ?? "", /fixture-redacted-value/);
      assert.doesNotMatch(repository.failureMessage ?? "", /fixture-redacted-value/);
      assert.equal(result.workspaceManifestPath, undefined);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("skips already-ready jobs so retries do not double-finalize work", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "content-ops-worker-"));
    const repository = new InMemoryWorkerRepository();

    try {
      const first = await processMockHyperframesRenderJob(QUEUE_PAYLOAD, {
        repository,
        workspaceRoot,
        runtime: RUNTIME_BOUNDARY,
      });
      const second = await processMockHyperframesRenderJob(QUEUE_PAYLOAD, {
        repository,
        workspaceRoot,
        runtime: RUNTIME_BOUNDARY,
      });

      assert.equal(first.status, "ready");
      assert.equal(second.status, "skipped");
      assert.deepEqual(repository.transitions, ["rendering", "ready"]);
      assert.equal(repository.readyCount, 1);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

const RUNTIME_BOUNDARY = {
  chromeExecutablePath: "/usr/bin/chromium",
  ffmpegPath: "/usr/bin/ffmpeg",
  hyperframesCommand: "npx hyperframes",
};

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

class InMemoryWorkerRepository implements RenderWorkerRepository {
  transitions: readonly string[] = [];
  readyCount = 0;
  readyManifest?: RenderOutputManifest;
  failureMessage?: string;
  private status: "render_queued" | "rendering" | "ready" | "failed" = "render_queued";

  async markRendering(): Promise<RenderWorkerClaim> {
    if (this.status === "ready") {
      return { renderJobId: "render_job_fixture", alreadyReady: true };
    }

    this.status = "rendering";
    this.transitions = [...this.transitions, "rendering"];
    return { renderJobId: "render_job_fixture" };
  }

  async markReady(_claim: RenderWorkerClaim, outputManifest: RenderOutputManifest): Promise<void> {
    if (this.status === "ready") {
      return;
    }

    this.status = "ready";
    this.readyCount += 1;
    this.readyManifest = outputManifest;
    this.transitions = [...this.transitions, "ready"];
  }

  async markFailed(_payload: QueueJobPayload, failure: { message: string }): Promise<void> {
    if (this.status === "ready") {
      return;
    }

    this.status = "failed";
    this.failureMessage = failure.message;
    this.transitions = [...this.transitions, "failed"];
  }
}

function assertPathInside(root: string, candidate: string): void {
  const relativePath = relative(root, candidate);

  assert.equal(relativePath.startsWith(".."), false);
  assert.equal(relativePath === "", false);
}
