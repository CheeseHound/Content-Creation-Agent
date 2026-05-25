import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  assertNoSecretLikeFields,
  type QueueJobPayload,
  type RenderOutputManifest,
  validateQueuePayload,
  WorkerValidationError,
} from "./payload";

export interface HyperframesWorkerRuntime {
  chromeExecutablePath: string;
  ffmpegPath: string;
  hyperframesCommand: string;
}

export interface RenderWorkerClaim {
  renderJobId: string;
  alreadyReady?: boolean;
}

export interface RenderWorkerRepository {
  markRendering(
    payload: QueueJobPayload,
    metadata: { workspaceManifestPath: string },
  ): Promise<RenderWorkerClaim>;
  markReady(claim: RenderWorkerClaim, outputManifest: RenderOutputManifest): Promise<void>;
  markFailed(
    payload: QueueJobPayload,
    failure: { code: string; message: string },
  ): Promise<void>;
}

export interface ProcessMockHyperframesRenderJobDependencies {
  repository: RenderWorkerRepository;
  workspaceRoot: string;
  runtime: HyperframesWorkerRuntime;
  schemaPath?: string;
}

export type MockHyperframesRenderResult =
  | {
    status: "ready";
    renderJobId: string;
    workspaceManifestPath: string;
  }
  | {
    status: "skipped";
    renderJobId: string;
    reason: "already_ready";
  }
  | {
    status: "failure";
    errorMessage: string;
    workspaceManifestPath?: string;
  };

interface WorkspacePaths {
  root: string;
  compositionDirectory: string;
  sourceReferencesDirectory: string;
  workspaceManifestPath: string;
}

interface StagedSourceAsset {
  role: "primary_video";
  assetId: string;
  storageKey: string;
  localReferencePath: string;
  downloadRequired: true;
}

export async function processMockHyperframesRenderJob(
  rawPayload: unknown,
  dependencies: ProcessMockHyperframesRenderJobDependencies,
): Promise<MockHyperframesRenderResult> {
  let payload: QueueJobPayload | undefined;
  let workspaceManifestPath: string | undefined;

  try {
    payload = validateQueuePayload(rawPayload, dependencies.schemaPath);
    validatePayloadStorageScope(payload);

    const workspacePaths = buildWorkspacePaths(dependencies.workspaceRoot, payload);
    workspaceManifestPath = workspacePaths.workspaceManifestPath;

    const claim = await dependencies.repository.markRendering(payload, {
      workspaceManifestPath: workspacePaths.workspaceManifestPath,
    });

    if (claim.alreadyReady) {
      return {
        status: "skipped",
        renderJobId: claim.renderJobId,
        reason: "already_ready",
      };
    }

    const sourceAssets = await stageSourceAssetReferences(payload, workspacePaths);
    const manifest = buildWorkspaceManifest(payload, dependencies.runtime, sourceAssets);
    assertNoSecretLikeFields(manifest, "manifest");

    await mkdir(workspacePaths.compositionDirectory, { recursive: true });
    await writeFile(
      workspacePaths.workspaceManifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    await dependencies.repository.markReady(claim, { outputs: [] });

    return {
      status: "ready",
      renderJobId: claim.renderJobId,
      workspaceManifestPath: workspacePaths.workspaceManifestPath,
    };
  } catch (error) {
    const message = safeFailureMessage(error);

    if (payload) {
      await dependencies.repository.markFailed(payload, {
        code: "mock_hyperframes_render_failed",
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

function buildWorkspaceManifest(
  payload: QueueJobPayload,
  runtime: HyperframesWorkerRuntime,
  sourceAssets: readonly StagedSourceAsset[],
) {
  return {
    schemaVersion: "content_ops.hyperframes_workspace.v1",
    workerMode: "mock",
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
      mp4Rendering: "not_started_mock_worker",
    },
  };
}

async function stageSourceAssetReferences(
  payload: QueueJobPayload,
  paths: WorkspacePaths,
): Promise<readonly StagedSourceAsset[]> {
  await mkdir(paths.sourceReferencesDirectory, { recursive: true });

  return Promise.all(payload.render.source_assets.map(async (asset) => {
    const assetId = safePathSegment(asset.asset_id, "source asset id");
    const filename = `${asset.role}-${assetId}.json`;
    const localReferencePath = assertInside(paths.root, join(paths.sourceReferencesDirectory, filename));
    const stagedAsset = {
      role: asset.role,
      assetId: asset.asset_id,
      storageKey: asset.storage_key,
      localReferencePath,
      downloadRequired: true,
    } as const;

    await writeFile(localReferencePath, `${JSON.stringify(stagedAsset, null, 2)}\n`, "utf8");

    return stagedAsset;
  }));
}

function buildWorkspacePaths(workspaceRoot: string, payload: QueueJobPayload): WorkspacePaths {
  const root = resolve(workspaceRoot);
  const workspaceId = safePathSegment(payload.workspace_id, "workspace id");
  const projectId = safePathSegment(payload.project_id, "project id");
  const sourceAssetId = safePathSegment(payload.source_asset_id, "source asset id");
  const compositionDirectory = assertInside(
    root,
    join(
      root,
      "workspaces",
      workspaceId,
      "projects",
      projectId,
      "render-jobs",
      sourceAssetId,
      "composition",
    ),
  );

  return {
    root,
    compositionDirectory,
    sourceReferencesDirectory: assertInside(root, join(compositionDirectory, "source-refs")),
    workspaceManifestPath: assertInside(root, join(compositionDirectory, "render-workspace-manifest.json")),
  };
}

function validatePayloadStorageScope(payload: QueueJobPayload): void {
  const expectedPrefix = `workspaces/${payload.workspace_id}/projects/${payload.project_id}/`;
  const keys = [
    payload.storage.source_key,
    payload.storage.audio_key,
    payload.storage.transcript_key,
    payload.storage.render_output_prefix,
    ...payload.render.source_assets.map((asset) => asset.storage_key),
  ];

  keys.forEach((key) => {
    if (!key.startsWith(expectedPrefix) || key.includes("..") || key.startsWith("/")) {
      throw new WorkerValidationError(
        "storage keys must stay under the payload workspace and project prefix",
        "render workspace validation failed",
      );
    }
  });
}

function safePathSegment(value: string, label: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) {
    throw new WorkerValidationError(
      `${label} is not safe for a render workspace path`,
      "render workspace validation failed",
    );
  }

  return value;
}

function assertInside(root: string, candidate: string): string {
  const resolvedCandidate = resolve(candidate);
  const relativePath = relative(root, resolvedCandidate);

  if (relativePath === "" || relativePath.startsWith("..") || relativePath.includes("..")) {
    throw new WorkerValidationError(
      "render workspace path escaped the worker root",
      "render workspace validation failed",
    );
  }

  return resolvedCandidate;
}

function safeFailureMessage(error: unknown): string {
  if (error instanceof WorkerValidationError) {
    return error.publicMessage;
  }

  return "mock render worker failed";
}
