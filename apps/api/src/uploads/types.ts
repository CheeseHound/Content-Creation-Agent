import type { ValidationResult, WorkspaceSubscription } from "../render-jobs/types";

export interface CreateUploadPresignBody {
  workspaceId: string;
  projectId: string;
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds?: number;
}

export interface MediaAssetRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  uploadedByUserId: string;
  sourceKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds?: number;
}

export interface UploadTarget {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface UploadPresignResult {
  asset: {
    id: string;
    workspaceId: string;
    projectId: string;
    sourceKey: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    durationSeconds?: number;
  };
  upload: UploadTarget;
}

export interface UploadSignerRequest {
  key: string;
  contentType: string;
  sizeBytes: number;
  expiresAt: Date;
}

export interface UploadSigner {
  presignUpload(request: UploadSignerRequest): Promise<UploadTarget>;
}

export interface UploadRepository {
  getWorkspaceSubscription(workspaceId: string): Promise<WorkspaceSubscription>;
  createMediaAsset(record: MediaAssetRecord): Promise<MediaAssetRecord>;
}

export interface CreateUploadPresignDependencies {
  uploadRepository: UploadRepository;
  signer: UploadSigner;
  createAssetId?: () => string;
  now?: () => Date;
  uploadTtlSeconds?: number;
}

export type UploadValidationResult = ValidationResult<CreateUploadPresignBody>;
