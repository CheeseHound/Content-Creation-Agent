import { spawn } from "node:child_process";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import {
  assertNoSecretLikeFields,
  type QueueJobPayload,
  type RenderOutputManifest,
  validateQueuePayload,
} from "./payload";
import type {
  HyperframesRenderResult,
  HyperframesWorkerRuntime,
  RenderWorkerClaim,
  RenderWorkerRepository,
} from "./render-worker-types";
import {
  assertInside,
  buildWorkspacePaths,
  safeFailureMessage,
  safePathSegment,
  validatePayloadStorageScope,
} from "./render-workspace";
import type { RenderStorageClient } from "./render-storage";

export type {
  HyperframesRenderResult,
  HyperframesWorkerRuntime,
  RenderWorkerClaim,
  RenderWorkerRepository,
} from "./render-worker-types";

export interface DownloadedSourceAsset {
  role: "primary_video";
  assetId: string;
  storageKey: string;
  localPath: string;
  sizeBytes: number;
}

export interface HyperframesRenderRunnerRequest {
  payload: QueueJobPayload;
  runtime: HyperframesWorkerRuntime;
  workspaceManifestPath: string;
  compositionDirectory: string;
  outputDirectory: string;
  sourceAssets: readonly DownloadedSourceAsset[];
}

export interface HyperframesRenderRunnerOutput {
  outputs: Array<{
    id: string;
    filename: string;
    localPath: string;
    contentType: string;
    durationSeconds?: number;
  }>;
}

export interface HyperframesRenderRunner {
  render(request: HyperframesRenderRunnerRequest): Promise<HyperframesRenderRunnerOutput>;
}

export interface ProcessHyperframesRenderJobDependencies {
  repository: RenderWorkerRepository;
  storage: RenderStorageClient;
  runner: HyperframesRenderRunner;
  workspaceRoot: string;
  runtime: HyperframesWorkerRuntime;
  schemaPath?: string;
}

export async function processHyperframesRenderJob(
  rawPayload: unknown,
  dependencies: ProcessHyperframesRenderJobDependencies,
): Promise<HyperframesRenderResult> {
  let payload: QueueJobPayload | undefined;
  let workspaceManifestPath: string | undefined;

  try {
    payload = validateQueuePayload(rawPayload, dependencies.schemaPath);
    validatePayloadStorageScope(payload);

    const workspacePaths = buildWorkspacePaths(dependencies.workspaceRoot, payload);
    workspaceManifestPath = workspacePaths.workspaceManifestPath;
    const claim = await dependencies.repository.markRendering(payload, {
      workspaceManifestPath,
    });

    if (claim.alreadyReady) {
      return {
        status: "skipped",
        renderJobId: claim.renderJobId,
        reason: "already_ready",
      };
    }

    await mkdir(workspacePaths.compositionDirectory, { recursive: true });
    await mkdir(workspacePaths.sourceAssetsDirectory, { recursive: true });
    await rm(workspacePaths.outputDirectory, { recursive: true, force: true });
    await mkdir(workspacePaths.outputDirectory, { recursive: true });

    const sourceAssets = await downloadSourceAssets(
      payload,
      workspacePaths.sourceAssetsDirectory,
      dependencies.storage,
    );
    const manifest = buildWorkspaceManifest(payload, dependencies.runtime, sourceAssets);
    assertNoSecretLikeFields(manifest, "manifest");
    await writeFile(workspaceManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const rendered = await dependencies.runner.render({
      payload,
      runtime: dependencies.runtime,
      workspaceManifestPath,
      compositionDirectory: workspacePaths.compositionDirectory,
      outputDirectory: workspacePaths.outputDirectory,
      sourceAssets,
    });
    const outputManifest = await uploadRenderedOutputs(
      payload,
      rendered,
      dependencies.storage,
    );
    assertNoSecretLikeFields(outputManifest, "output_manifest");
    await dependencies.repository.markReady(claim, outputManifest);

    return {
      status: "ready",
      renderJobId: claim.renderJobId,
      workspaceManifestPath,
    };
  } catch (error) {
    const message = safeFailureMessage(error, "real render worker failed");

    if (payload) {
      await dependencies.repository.markFailed(payload, {
        code: "real_hyperframes_render_failed",
        message,
      });
    }

    return {
      status: "failure",
      errorMessage: message,
      ...(workspaceManifestPath ? { workspaceManifestPath } : {}),
    };
  }
}

export class CommandHyperframesRenderRunner implements HyperframesRenderRunner {
  async render(request: HyperframesRenderRunnerRequest): Promise<HyperframesRenderRunnerOutput> {
    await runShellCommand(
      [
        request.runtime.hyperframesCommand,
        "render",
        "--manifest",
        shellQuote(request.workspaceManifestPath),
        "--output",
        shellQuote(request.outputDirectory),
      ].join(" "),
      request.compositionDirectory,
      {
        CHROME_EXECUTABLE_PATH: request.runtime.chromeExecutablePath,
        PUPPETEER_EXECUTABLE_PATH: request.runtime.chromeExecutablePath,
        FFMPEG_PATH: request.runtime.ffmpegPath,
      },
    );
    const outputFiles = await listMp4Outputs(request.outputDirectory);

    if (outputFiles.length === 0) {
      throw new Error("Hyperframes render command did not produce MP4 outputs");
    }

    return {
      outputs: outputFiles.map((output, index) => ({
        id: `clip_${index + 1}`,
        filename: output.filename,
        localPath: output.localPath,
        contentType: "video/mp4",
      })),
    };
  }
}

async function downloadSourceAssets(
  payload: QueueJobPayload,
  sourceAssetsDirectory: string,
  storage: RenderStorageClient,
): Promise<readonly DownloadedSourceAsset[]> {
  return Promise.all(payload.render.source_assets.map(async (asset) => {
    const assetId = safePathSegment(asset.asset_id, "source asset id");
    const sourceFilename = safeStorageFilename(asset.storage_key);
    const localPath = assertInside(
      sourceAssetsDirectory,
      join(sourceAssetsDirectory, `${asset.role}-${assetId}-${sourceFilename}`),
    );
    const downloaded = await storage.downloadObject({
      key: asset.storage_key,
      destinationPath: localPath,
    });

    return {
      role: asset.role,
      assetId: asset.asset_id,
      storageKey: asset.storage_key,
      localPath: downloaded.localPath,
      sizeBytes: downloaded.sizeBytes,
    };
  }));
}

async function uploadRenderedOutputs(
  payload: QueueJobPayload,
  rendered: HyperframesRenderRunnerOutput,
  storage: RenderStorageClient,
): Promise<RenderOutputManifest> {
  if (rendered.outputs.length === 0) {
    throw new Error("render runner did not produce outputs");
  }

  const outputs = await Promise.all(rendered.outputs.map(async (output) => {
    const filename = safeOutputFilename(output.filename);
    const storageKey = `${payload.storage.render_output_prefix}${filename}`;
    const uploaded = await storage.uploadObject({
      key: storageKey,
      sourcePath: output.localPath,
      contentType: output.contentType,
    });

    return {
      id: safePathSegment(output.id, "render output id"),
      storageKey,
      filename,
      contentType: uploaded.contentType,
      ...(output.durationSeconds === undefined
        ? {}
        : { durationSeconds: output.durationSeconds }),
      sizeBytes: uploaded.sizeBytes,
    };
  }));

  return { outputs };
}

function buildWorkspaceManifest(
  payload: QueueJobPayload,
  runtime: HyperframesWorkerRuntime,
  sourceAssets: readonly DownloadedSourceAsset[],
) {
  return {
    schemaVersion: "content_ops.hyperframes_workspace.v1",
    workerMode: "real",
    renderEngine: payload.render.render_engine,
    workspaceId: payload.workspace_id,
    projectId: payload.project_id,
    sourceAssetId: payload.source_asset_id,
    runtime: {
      browserAutomation: "puppeteer",
      headlessBrowser: "chrome/chromium",
      chromeExecutablePath: runtime.chromeExecutablePath,
      ffmpegPath: runtime.ffmpegPath,
      hyperframesCommand: runtime.hyperframesCommand,
    },
    composition: payload.render.composition,
    template: payload.render.template,
    styleOptions: payload.render.style_options,
    captionTimeline: payload.render.caption_timeline,
    sourceAssets,
    output: {
      renderOutputPrefix: payload.storage.render_output_prefix,
      settings: payload.render.output_settings,
    },
    diagnostics: {
      mp4Rendering: "pending_hyperframes_command",
    },
  };
}

async function listMp4Outputs(
  outputDirectory: string,
): Promise<Array<{ filename: string; localPath: string }>> {
  const entries = await readdir(outputDirectory, { withFileTypes: true });
  const outputs = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"))
    .map((entry) => ({
      filename: entry.name,
      localPath: join(outputDirectory, entry.name),
    }));

  return Promise.all(outputs.map(async (output) => {
    await stat(output.localPath);
    return output;
  }));
}

function safeStorageFilename(storageKey: string): string {
  return safeOutputFilename(basename(storageKey));
}

function safeOutputFilename(filename: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(filename) || filename.includes("..")) {
    throw new Error("render output filename is not safe");
  }

  return filename;
}

function runShellCommand(command: string, cwd: string, env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(
        `Hyperframes render command failed with exit code ${code}: ${stderr.slice(0, 500)}`,
      ));
    });
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
