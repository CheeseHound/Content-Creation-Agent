import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  assertNoSecretLikeFields,
  type QueueJobPayload,
  type RenderOutputManifest,
  validateQueuePayload,
} from "./payload";
import {
  trackWorkerRenderFailedBestEffort,
  trackWorkerRenderReadyBestEffort,
  trackWorkerRenderStartedBestEffort,
  type WorkerAnalyticsSink,
} from "./analytics";
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
  type WorkspacePaths,
} from "./render-workspace";

export type { HyperframesWorkerRuntime, RenderWorkerClaim, RenderWorkerRepository };

export interface ProcessMockHyperframesRenderJobDependencies {
  repository: RenderWorkerRepository;
  workspaceRoot: string;
  runtime: HyperframesWorkerRuntime;
  schemaPath?: string;
  analyticsSink?: WorkerAnalyticsSink;
  now?: () => Date;
}

export type MockHyperframesRenderResult = HyperframesRenderResult;

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
  let renderJobId: string | undefined;

  try {
    payload = validateQueuePayload(rawPayload, dependencies.schemaPath);
    validatePayloadStorageScope(payload);

    const workspacePaths = buildWorkspacePaths(dependencies.workspaceRoot, payload);
    workspaceManifestPath = workspacePaths.workspaceManifestPath;

    const claim = await dependencies.repository.markRendering(payload, {
      workspaceManifestPath: workspacePaths.workspaceManifestPath,
    });
    renderJobId = claim.renderJobId;

    if (claim.alreadyReady) {
      return {
        status: "skipped",
        renderJobId: claim.renderJobId,
        reason: "already_ready",
      };
    }

    await trackWorkerRenderStartedBestEffort({
      sink: dependencies.analyticsSink,
      payload,
      renderJobId: claim.renderJobId,
      workerMode: "mock",
      occurredAt: dependencies.now?.() ?? new Date(),
    });

    const sourceAssets = await stageSourceAssetReferences(payload, workspacePaths);
    const manifest = buildWorkspaceManifest(payload, dependencies.runtime, sourceAssets);
    assertNoSecretLikeFields(manifest, "manifest");

    await mkdir(workspacePaths.compositionDirectory, { recursive: true });
    await writeFile(
      workspacePaths.workspaceManifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    const outputManifest: RenderOutputManifest = { outputs: [] };
    await dependencies.repository.markReady(claim, outputManifest);
    await trackWorkerRenderReadyBestEffort({
      sink: dependencies.analyticsSink,
      payload,
      renderJobId: claim.renderJobId,
      workerMode: "mock",
      outputManifest,
      occurredAt: dependencies.now?.() ?? new Date(),
    });

    return {
      status: "ready",
      renderJobId: claim.renderJobId,
      workspaceManifestPath: workspacePaths.workspaceManifestPath,
    };
  } catch (error) {
    const message = safeFailureMessage(error, "mock render worker failed");

    if (payload) {
      await dependencies.repository.markFailed(payload, {
        code: "mock_hyperframes_render_failed",
        message,
      });
      await trackWorkerRenderFailedBestEffort({
        sink: dependencies.analyticsSink,
        payload,
        renderJobId,
        workerMode: "mock",
        failureCode: "mock_hyperframes_render_failed",
        occurredAt: dependencies.now?.() ?? new Date(),
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
