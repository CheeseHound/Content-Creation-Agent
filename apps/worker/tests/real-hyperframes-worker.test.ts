import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";

import {
  CommandHyperframesRenderRunner,
  processHyperframesRenderJob,
  type HyperframesRenderRunner,
  type RenderWorkerClaim,
  type RenderWorkerRepository,
} from "../src/hyperframes-worker";
import { LocalFilesystemRenderStorage } from "../src/render-storage";
import type { QueueJobPayload, RenderOutputManifest } from "../src/payload";

describe("real Hyperframes render worker slice", () => {
  it("executes the configured Hyperframes command boundary and discovers MP4 outputs", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "content-ops-real-worker-"));
    const compositionDirectory = join(tempRoot, "composition");
    const outputDirectory = join(tempRoot, "outputs");
    const workspaceManifestPath = join(compositionDirectory, "workspace.json");
    const shimPath = join(tempRoot, "hyperframes-shim.sh");
    const runner = new CommandHyperframesRenderRunner();

    try {
      await mkdir(compositionDirectory, { recursive: true });
      await writeFile(workspaceManifestPath, "{}\n", "utf8");
      await writeFile(
        shimPath,
        [
          "#!/bin/sh",
          "if [ \"$1\" != \"render\" ]; then exit 20; fi",
          "while [ \"$#\" -gt 0 ]; do",
          "  case \"$1\" in",
          "    --manifest) manifest=\"$2\"; shift 2 ;;",
          "    --output) output=\"$2\"; shift 2 ;;",
          "    *) shift ;;",
          "  esac",
          "done",
          "test -f \"$manifest\" || exit 21",
          "mkdir -p \"$output\"",
          "printf 'shim rendered mp4' > \"$output/clip-shim.mp4\"",
          "",
        ].join("\n"),
        "utf8",
      );
      await chmod(shimPath, 0o755);

      const result = await runner.render({
        payload: QUEUE_PAYLOAD,
        runtime: {
          ...RUNTIME_BOUNDARY,
          hyperframesCommand: shimPath,
        },
        workspaceManifestPath,
        compositionDirectory,
        outputDirectory,
        sourceAssets: [],
      });

      assert.deepEqual(result.outputs, [
        {
          id: "clip_1",
          filename: "clip-shim.mp4",
          localPath: join(outputDirectory, "clip-shim.mp4"),
          contentType: "video/mp4",
        },
      ]);
      assert.equal(await readFile(join(outputDirectory, "clip-shim.mp4"), "utf8"), "shim rendered mp4");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("downloads source assets, runs the render boundary, uploads outputs, then marks ready", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "content-ops-real-worker-"));
    const workspaceRoot = join(tempRoot, "worker");
    const storageRoot = join(tempRoot, "storage");
    const sourcePath = join(storageRoot, QUEUE_PAYLOAD.storage.source_key);
    const repository = new InMemoryWorkerRepository();
    const runner = new FixtureRenderRunner();

    try {
      await mkdir(dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, "fixture source video", "utf8");

      const result = await processHyperframesRenderJob(QUEUE_PAYLOAD, {
        repository,
        storage: new LocalFilesystemRenderStorage(storageRoot),
        runner,
        runtime: RUNTIME_BOUNDARY,
        workspaceRoot,
      });

      assert.equal(result.status, "ready");
      assert.deepEqual(repository.transitions, ["rendering", "ready"]);
      assert.equal(repository.readyManifest?.outputs.length, 1);

      const output = repository.readyManifest?.outputs[0];
      assert.equal(
        output?.storageKey,
        "workspaces/workspace_123/projects/project_456/renders/asset_abc/clip-1.mp4",
      );
      assert.equal(output?.contentType, "video/mp4");
      assert.equal(output?.filename, "clip-1.mp4");
      assert.ok((output?.sizeBytes ?? 0) > 0);

      const uploadedOutput = join(storageRoot, output?.storageKey ?? "");
      assert.equal(await readFile(uploadedOutput, "utf8"), "fixture rendered mp4");
      assert.equal(runner.requests.length, 1);
      assert.equal(
        runner.requests[0]?.sourceAssets[0]?.storageKey,
        QUEUE_PAYLOAD.storage.source_key,
      );
      assertPathInside(workspaceRoot, runner.requests[0]?.sourceAssets[0]?.localPath ?? "");
      assert.equal(
        await readFile(runner.requests[0]?.sourceAssets[0]?.localPath ?? "", "utf8"),
        "fixture source video",
      );

      const manifest = JSON.parse(await readFile(result.workspaceManifestPath, "utf8")) as {
        workerMode: string;
        sourceAssets: Array<{ localPath: string; storageKey: string }>;
        output: { renderOutputPrefix: string };
      };

      assert.equal(manifest.workerMode, "real");
      assert.equal(manifest.output.renderOutputPrefix, QUEUE_PAYLOAD.storage.render_output_prefix);
      assert.equal(manifest.sourceAssets[0]?.storageKey, QUEUE_PAYLOAD.storage.source_key);
      assertPathInside(workspaceRoot, manifest.sourceAssets[0]?.localPath ?? "");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("does not mark ready when output upload fails", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "content-ops-real-worker-"));
    const workspaceRoot = join(tempRoot, "worker");
    const storageRoot = join(tempRoot, "storage");
    const sourcePath = join(storageRoot, QUEUE_PAYLOAD.storage.source_key);
    const repository = new InMemoryWorkerRepository();
    const runner = new FixtureRenderRunner();
    const storage = new FailingUploadStorage(storageRoot);

    try {
      await mkdir(dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, "fixture source video", "utf8");

      const result = await processHyperframesRenderJob(QUEUE_PAYLOAD, {
        repository,
        storage,
        runner,
        runtime: RUNTIME_BOUNDARY,
        workspaceRoot,
      });

      assert.equal(result.status, "failure");
      assert.deepEqual(repository.transitions, ["rendering", "failed"]);
      assert.equal(repository.readyManifest, undefined);
      assert.match(repository.failureMessage ?? "", /real render worker failed/);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects unsafe local storage keys before touching paths outside the storage root", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "content-ops-real-worker-"));
    const storage = new LocalFilesystemRenderStorage(join(tempRoot, "storage"));

    try {
      await assert.rejects(
        storage.downloadObject({
          key: "../outside.mov",
          destinationPath: join(tempRoot, "worker", "outside.mov"),
        }),
        /storage object key is not safe/,
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
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

class FixtureRenderRunner implements HyperframesRenderRunner {
  requests: readonly Parameters<HyperframesRenderRunner["render"]>[0][] = [];

  async render(request: Parameters<HyperframesRenderRunner["render"]>[0]) {
    this.requests = [...this.requests, request];
    const outputPath = join(request.outputDirectory, "clip-1.mp4");

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, "fixture rendered mp4", "utf8");

    return {
      outputs: [
        {
          id: "clip_1",
          filename: "clip-1.mp4",
          localPath: outputPath,
          contentType: "video/mp4",
          durationSeconds: 2,
        },
      ],
    };
  }
}

class InMemoryWorkerRepository implements RenderWorkerRepository {
  transitions: readonly string[] = [];
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
    this.status = "ready";
    this.readyManifest = outputManifest;
    this.transitions = [...this.transitions, "ready"];
  }

  async markFailed(_payload: QueueJobPayload, failure: { message: string }): Promise<void> {
    this.status = "failed";
    this.failureMessage = failure.message;
    this.transitions = [...this.transitions, "failed"];
  }
}

class FailingUploadStorage extends LocalFilesystemRenderStorage {
  async uploadObject(): Promise<never> {
    throw new Error("fixture upload failure with secret-value-that-must-not-leak");
  }
}

function assertPathInside(root: string, candidate: string): void {
  const relativePath = relative(root, candidate);

  assert.equal(relativePath.startsWith(".."), false);
  assert.equal(relativePath === "", false);
}
