import { join, relative, resolve } from "node:path";

import type { QueueJobPayload } from "./payload";
import { WorkerValidationError } from "./payload";

export interface WorkspacePaths {
  root: string;
  compositionDirectory: string;
  sourceReferencesDirectory: string;
  sourceAssetsDirectory: string;
  outputDirectory: string;
  workspaceManifestPath: string;
}

export function buildWorkspacePaths(
  workspaceRoot: string,
  payload: QueueJobPayload,
): WorkspacePaths {
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
    sourceAssetsDirectory: assertInside(root, join(compositionDirectory, "source-assets")),
    outputDirectory: assertInside(root, join(compositionDirectory, "outputs")),
    workspaceManifestPath: assertInside(root, join(compositionDirectory, "render-workspace-manifest.json")),
  };
}

export function validatePayloadStorageScope(payload: QueueJobPayload): void {
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

export function safePathSegment(value: string, label: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) {
    throw new WorkerValidationError(
      `${label} is not safe for a render workspace path`,
      "render workspace validation failed",
    );
  }

  return value;
}

export function assertInside(root: string, candidate: string): string {
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

export function safeFailureMessage(error: unknown, fallback: string): string {
  if (error instanceof WorkerValidationError) {
    return error.publicMessage;
  }

  return fallback;
}
