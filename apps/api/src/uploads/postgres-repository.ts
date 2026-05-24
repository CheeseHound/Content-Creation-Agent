import type {
  PostgresQueryClient,
} from "../render-jobs/postgres-repository";
import {
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
  type WorkspaceSubscription,
} from "../render-jobs/types";
import type { MediaAssetRecord, UploadRepository } from "./types";

interface SubscriptionRow {
  tier: unknown;
}

interface MediaAssetRow {
  id: unknown;
  workspace_id: unknown;
  project_id: unknown;
  uploaded_by_user_id: unknown;
  source_key: unknown;
  filename: unknown;
  content_type: unknown;
  size_bytes: unknown;
  duration_seconds: unknown;
}

export class PostgresUploadRepository implements UploadRepository {
  constructor(private readonly client: PostgresQueryClient) {}

  async getWorkspaceSubscription(workspaceId: string): Promise<WorkspaceSubscription> {
    const result = await this.client.query<SubscriptionRow>(
      `
        select tier
        from subscriptions
        where workspace_id = $1
          and status in ('trialing', 'active')
        order by current_period_end desc nulls last, updated_at desc
        limit 1
      `,
      [workspaceId],
    );
    const row = result.rows[0];

    if (!row) {
      return { tier: "free" };
    }

    return {
      tier: requireSubscriptionTier(row.tier),
    };
  }

  async createMediaAsset(record: MediaAssetRecord): Promise<MediaAssetRecord> {
    const result = await this.client.query<MediaAssetRow>(
      `
        insert into media_assets (
          id,
          workspace_id,
          project_id,
          uploaded_by_user_id,
          source_key,
          filename,
          content_type,
          size_bytes,
          duration_seconds
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning
          id,
          workspace_id,
          project_id,
          uploaded_by_user_id,
          source_key,
          filename,
          content_type,
          size_bytes,
          duration_seconds
      `,
      [
        record.id,
        record.workspaceId,
        record.projectId,
        record.uploadedByUserId,
        record.sourceKey,
        record.filename,
        record.contentType,
        record.sizeBytes,
        record.durationSeconds ?? null,
      ],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("media asset insert did not return a row");
    }

    return mapMediaAssetRow(row);
  }
}

function mapMediaAssetRow(row: MediaAssetRow): MediaAssetRecord {
  const durationSeconds = row.duration_seconds === null
    ? undefined
    : toPositiveInteger(row.duration_seconds, "duration_seconds");

  return {
    id: requireString(row.id, "id"),
    workspaceId: requireString(row.workspace_id, "workspace_id"),
    projectId: requireString(row.project_id, "project_id"),
    uploadedByUserId: requireString(row.uploaded_by_user_id, "uploaded_by_user_id"),
    sourceKey: requireString(row.source_key, "source_key"),
    filename: requireString(row.filename, "filename"),
    contentType: requireString(row.content_type, "content_type"),
    sizeBytes: toPositiveInteger(row.size_bytes, "size_bytes"),
    durationSeconds,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value;
}

function requireSubscriptionTier(value: unknown): SubscriptionTier {
  if (typeof value === "string" && SUBSCRIPTION_TIERS.includes(value as SubscriptionTier)) {
    return value as SubscriptionTier;
  }

  throw new Error("subscription tier is not supported");
}

function toPositiveInteger(value: unknown, field: string): number {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new Error(`${field} must be a positive integer`);
  }

  return numberValue;
}
