import { randomUUID } from "node:crypto";

import { DEFAULT_ENTITLEMENTS, buildStorageKeys } from "../render-jobs/contract";
import type {
  CreateUploadPresignBody,
  CreateUploadPresignDependencies,
  MediaAssetRecord,
  UploadPresignResult,
} from "./types";

export const DEFAULT_UPLOAD_PRESIGN_TTL_SECONDS = 15 * 60;

export class UploadPresignRejectedError extends Error {
  readonly code = "plan_limit_exceeded";

  constructor(message: string) {
    super(message);
    this.name = "UploadPresignRejectedError";
  }
}

export async function createUploadPresign(
  request: CreateUploadPresignBody,
  dependencies: CreateUploadPresignDependencies,
): Promise<UploadPresignResult> {
  const subscription = await dependencies.uploadRepository.getWorkspaceSubscription(
    request.workspaceId,
  );
  const entitlement = DEFAULT_ENTITLEMENTS[subscription.tier];

  if (request.sizeBytes > entitlement.maxSourceBytes) {
    throw new UploadPresignRejectedError("source asset exceeds plan upload limit");
  }

  const assetId = dependencies.createAssetId?.() ?? createAssetId();
  const storageKeys = buildStorageKeys({
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    sourceAssetId: assetId,
    sourceFilename: request.filename,
  });
  const ttlSeconds = dependencies.uploadTtlSeconds ?? DEFAULT_UPLOAD_PRESIGN_TTL_SECONDS;
  const expiresAt = new Date((dependencies.now?.() ?? new Date()).getTime() + ttlSeconds * 1000);
  const upload = await dependencies.signer.presignUpload({
    key: storageKeys.source_key,
    contentType: request.contentType,
    sizeBytes: request.sizeBytes,
    expiresAt,
  });
  const record: MediaAssetRecord = {
    id: assetId,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    uploadedByUserId: request.userId,
    sourceKey: storageKeys.source_key,
    filename: request.filename,
    contentType: request.contentType,
    sizeBytes: request.sizeBytes,
    durationSeconds: request.durationSeconds,
  };
  const asset = await dependencies.uploadRepository.createMediaAsset(record);

  return {
    asset: {
      id: asset.id,
      workspaceId: asset.workspaceId,
      projectId: asset.projectId,
      sourceKey: asset.sourceKey,
      filename: asset.filename,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      durationSeconds: asset.durationSeconds,
    },
    upload,
  };
}

function createAssetId(): string {
  return `asset_${randomUUID().replaceAll("-", "")}`;
}
